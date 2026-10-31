import os
import secrets
import hmac
import re
import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

import click
from flask import Flask, abort, flash, make_response, redirect, render_template, render_template_string, request, session, url_for
from functools import wraps
from sqlalchemy import and_, case, func, inspect, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from werkzeug.security import check_password_hash, generate_password_hash

from models import Customer, Invoice, Payment, Plan, Product, Quotation, Subscription, User, db


def role_required(*allowed_roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user_id = session.get("user_id")
            user = db.session.get(User, user_id) if user_id is not None else None
            if user is None:
                session.clear()
                return redirect(url_for("staff_login"))
            if user.role not in allowed_roles:
                abort(403)
            return view(*args, **kwargs)

        return wrapped

    return decorator


def _customer_status(customer):
    priorities = ("active", "confirmed", "quotation", "draft", "closed")
    statuses = {subscription.lifecycle_status for subscription in customer.subscriptions}
    return next((status for status in priorities if status in statuses), "none")


CUSTOMER_STATUS_LABELS = {
    "active": "Active",
    "confirmed": "Confirmed",
    "quotation": "Quotation",
    "draft": "Draft",
    "closed": "Closed",
}


def _subscription_expiring_cutoff(today=None):
    return (today or date.today()) + timedelta(days=30)


def _add_billing_cycle(start, billing_cycle):
    if billing_cycle == "monthly":
        month_index = start.month
        year = start.year + (month_index // 12)
        month = (month_index % 12) + 1
        return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))
    if billing_cycle == "quarterly":
        month_index = start.month + 2
        year = start.year + (month_index // 12)
        month = (month_index % 12) + 1
        return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))
    if billing_cycle == "yearly":
        year = start.year + 1
        return date(year, start.month, min(start.day, calendar.monthrange(year, start.month)[1]))
    return None


def _invoice_status_label(status):
    return {"open": "Confirmed", "overdue": "Confirmed", "void": "Draft"}.get(
        status, status.title()
    )


def _pdf_escape(value):
    return str(value).encode("ascii", "replace").decode("ascii").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _invoice_pdf(invoice):
    lines = [
        "BRIGHTLOOP SOFTWARE",
        "INVOICE",
        f"Invoice: {invoice.invoice_number}",
        f"Customer: {invoice.customer.name}",
        f"Email: {invoice.customer.email}",
        f"Invoice date: {invoice.issue_date:%B %d, %Y}",
        f"Due date: {invoice.due_date:%B %d, %Y}",
        f"Billing period: {invoice.billing_period_start or '-'} to {invoice.billing_period_end or '-'}",
        f"Status: {_invoice_status_label(invoice.status)}",
        f"Subtotal: ${invoice.subtotal:,.2f}",
        f"Tax: ${invoice.tax:,.2f}",
        f"Total: ${invoice.total:,.2f}",
    ]
    stream = "BT\n/F1 12 Tf\n50 790 Td\n"
    for index, line in enumerate(lines):
        if index:
            stream += "0 -28 Td\n"
        stream += f"({_pdf_escape(line)}) Tj\n"
    stream += "ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream.encode('ascii'))} >>\nstream\n{stream}\nendstream".encode("ascii"),
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("ascii"))
        pdf.extend(body)
        pdf.extend(b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(offsets)}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode("ascii")
    )
    return bytes(pdf)


def _effective_quotation_status(quotation, today=None):
    today = today or date.today()
    if quotation.status in ("draft", "sent") and quotation.valid_until < today:
        return "expired"
    return quotation.status


def _quotation_status_expression(today):
    return case(
        (
            and_(
                Quotation.status.in_(("draft", "sent")),
                Quotation.valid_until < today,
            ),
            "expired",
        ),
        else_=Quotation.status,
    )


def _calculate_quotation(plan, quantity):
    subtotal = (Decimal(plan.price) * quantity).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    # No tax rates or discount rules are present in the existing database.
    tax = Decimal("0.00")
    discount = Decimal("0.00")
    total = subtotal + tax - discount
    return subtotal, tax, discount, total


def _positive_int(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _customer_from_form(existing_customer=None):
    name = request.form.get("name", "").strip()
    email = request.form.get("email", "").strip().lower()
    phone = request.form.get("phone", "").strip()
    company_name = request.form.get("company_name", "").strip()
    billing_address = request.form.get("billing_address", "").strip()
    errors = {}

    if not name:
        errors["name"] = "Name is required."
    elif len(name) > 120:
        errors["name"] = "Name must be 120 characters or fewer."
    if not email:
        errors["email"] = "Email is required."
    elif len(email) > 255 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        errors["email"] = "Enter a valid email address."
    else:
        existing_email = Customer.query.filter(
            func.lower(Customer.email) == email
        ).first()
        if existing_email and (
            existing_customer is None or existing_email.id != existing_customer.id
        ):
            errors["email"] = "That email address is already in use."
    if len(phone) > 40:
        errors["phone"] = "Phone must be 40 characters or fewer."
    if len(company_name) > 160:
        errors["company_name"] = "Company must be 160 characters or fewer."

    return (
        Customer(
            name=name,
            email=email,
            phone=phone or None,
            company_name=company_name or None,
            billing_address=billing_address or None,
        ),
        errors,
    )


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY") or secrets.token_hex(32),
        SQLALCHEMY_DATABASE_URI="sqlite:///staff_dashboard.db",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
    )
    if test_config:
        app.config.update(test_config)

    os.makedirs(app.instance_path, exist_ok=True)
    db.init_app(app)

    with app.app_context():
        db.create_all()
        subscription_columns = {
            column["name"]
            for column in inspect(db.engine).get_columns("subscriptions")
        }
        subscription_migrations = (
            ("workflow_status", "VARCHAR(20)"),
            ("quantity", "INTEGER NOT NULL DEFAULT 1"),
            ("amount", "NUMERIC(10, 2) NOT NULL DEFAULT 0"),
        )
        for column_name, column_definition in subscription_migrations:
            if column_name not in subscription_columns:
                db.session.execute(
                    text(
                        f"ALTER TABLE subscriptions ADD COLUMN "
                        f"{column_name} {column_definition}"
                    )
                )
        if "workflow_status" not in subscription_columns:
            db.session.execute(
                text(
                    "UPDATE subscriptions SET workflow_status = CASE status "
                    "WHEN 'active' THEN 'active' "
                    "WHEN 'past_due' THEN 'confirmed' "
                    "WHEN 'canceled' THEN 'closed' "
                    "WHEN 'expired' THEN 'closed' "
                    "ELSE 'draft' END"
                )
            )
        if "quantity" not in subscription_columns:
            db.session.execute(
                text(
                    "UPDATE subscriptions SET quantity = COALESCE("
                    "(SELECT quotations.quantity FROM quotations "
                    "WHERE quotations.id = subscriptions.quotation_id), 1)"
                )
            )
        if "amount" not in subscription_columns:
            db.session.execute(
                text(
                    "UPDATE subscriptions SET amount = COALESCE("
                    "(SELECT quotations.amount FROM quotations "
                    "WHERE quotations.id = subscriptions.quotation_id), "
                    "(SELECT plans.price FROM plans WHERE plans.id = subscriptions.plan_id), 0) "
                    "WHERE amount = 0"
                )
            )

        invoice_columns = {
            column["name"] for column in inspect(db.engine).get_columns("invoices")
        }
        invoice_migrations = (
            ("billing_period_start", "DATE"),
            ("billing_period_end", "DATE"),
            ("sent_at", "DATETIME"),
        )
        for column_name, column_definition in invoice_migrations:
            if column_name not in invoice_columns:
                db.session.execute(
                    text(
                        f"ALTER TABLE invoices ADD COLUMN "
                        f"{column_name} {column_definition}"
                    )
                )
        db.session.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "uq_invoice_subscription_billing_period "
                "ON invoices(subscription_id, billing_period_start, billing_period_end) "
                "WHERE subscription_id IS NOT NULL "
                "AND billing_period_start IS NOT NULL "
                "AND billing_period_end IS NOT NULL"
            )
        )

        quotation_columns = {
            column["name"] for column in inspect(db.engine).get_columns("quotations")
        }
        quotation_migrations = (
            ("quantity", "INTEGER NOT NULL DEFAULT 1"),
            ("subtotal", "NUMERIC(10, 2) NOT NULL DEFAULT 0"),
            ("tax", "NUMERIC(10, 2) NOT NULL DEFAULT 0"),
            ("discount", "NUMERIC(10, 2) NOT NULL DEFAULT 0"),
        )
        for column_name, column_definition in quotation_migrations:
            if column_name not in quotation_columns:
                db.session.execute(
                    text(
                        f"ALTER TABLE quotations ADD COLUMN "
                        f"{column_name} {column_definition}"
                    )
                )
        if any(name not in quotation_columns for name, _ in quotation_migrations):
            db.session.execute(
                text(
                    "UPDATE quotations SET subtotal = amount "
                    "WHERE subtotal = 0 AND amount <> 0"
                )
            )
        db.session.commit()

    @app.before_request
    def protect_staff_forms():
        if request.method == "POST" and request.path.startswith("/staff/"):
            expected = session.get("_csrf_token")
            submitted = request.form.get("csrf_token", "")
            if not expected or not hmac.compare_digest(expected, submitted):
                abort(400, description="The form security token is missing or invalid.")

    @app.cli.command("create-staff")
    def create_staff():
        """Create a staff account using interactive prompts."""
        name = click.prompt("Name").strip()
        email = click.prompt("Email").strip().lower()
        password = click.prompt(
            "Password", hide_input=True, confirmation_prompt=True
        )

        if not name or not email or not password:
            raise click.ClickException("Name, email, and password are required.")
        if User.query.filter_by(email=email).first():
            raise click.ClickException(f"A user with email {email} already exists.")

        staff_user = User(
            name=name,
            email=email,
            password_hash=generate_password_hash(password),
            role="staff",
        )
        db.session.add(staff_user)
        try:
            db.session.commit()
        except IntegrityError as error:
            db.session.rollback()
            raise click.ClickException("Could not create the staff account.") from error

        click.echo(f"Created staff account for {email}.")

    @app.cli.command("seed-demo")
    def seed_demo():
        """Add a small, repeatable set of subscription demo data."""
        customers = []
        for name, email, company in (
            ("Alex Morgan", "alex.morgan@example.com", "Northstar Labs"),
            ("Sam Rivera", "sam.rivera@example.com", "Acorn Studio"),
        ):
            customer = Customer.query.filter_by(email=email).first()
            if customer is None:
                customer = Customer(
                    name=name,
                    email=email,
                    company_name=company,
                )
                db.session.add(customer)
                db.session.flush()
            customers.append(customer)

        products_and_plans = []
        for product_name, plan_name, price, cycle in (
            ("Brightloop Workspace", "Workspace Annual", Decimal("240.00"), "yearly"),
            ("Brightloop Analytics", "Analytics Monthly", Decimal("49.00"), "monthly"),
        ):
            product = Product.query.filter_by(name=product_name).first()
            if product is None:
                product = Product(name=product_name, description=f"{product_name} service")
                db.session.add(product)
                db.session.flush()

            plan = Plan.query.filter_by(product_id=product.id, name=plan_name).first()
            if plan is None:
                plan = Plan(
                    product_id=product.id,
                    name=plan_name,
                    price=price,
                    billing_cycle=cycle,
                )
                db.session.add(plan)
                db.session.flush()
            products_and_plans.append((product, plan))

        db.session.flush()
        for index, (customer, (product, plan)) in enumerate(
            zip(customers, products_and_plans), start=1
        ):
            quotation_number = f"Q-DEMO-{index:03d}"
            quotation = Quotation.query.filter_by(
                quotation_number=quotation_number
            ).first()
            if quotation is None:
                quotation = Quotation(
                    quotation_number=quotation_number,
                    customer_id=customer.id,
                    plan_id=plan.id,
                    status="accepted",
                    amount=plan.price,
                    valid_until=date.today() + timedelta(days=30),
                )
                db.session.add(quotation)
                db.session.flush()

            subscription_code = f"SUB-DEMO-{index:03d}"
            subscription = Subscription.query.filter_by(
                subscription_code=subscription_code
            ).first()
            if subscription is None:
                subscription = Subscription(
                    subscription_code=subscription_code,
                    customer_id=customer.id,
                    plan_id=plan.id,
                    quotation_id=quotation.id,
                    lifecycle_status="active",
                    quantity=quotation.quantity,
                    amount=quotation.amount,
                    status="active",
                    start_date=date.today() - timedelta(days=10),
                    next_billing_date=date.today() + timedelta(days=20),
                )
                db.session.add(subscription)
                db.session.flush()

            invoice_number = f"INV-DEMO-{index:03d}"
            invoice = Invoice.query.filter_by(invoice_number=invoice_number).first()
            if invoice is None:
                invoice_status = "paid" if index == 1 else "open"
                invoice = Invoice(
                    invoice_number=invoice_number,
                    customer_id=customer.id,
                    subscription_id=subscription.id,
                    issue_date=date.today() - timedelta(days=5),
                    due_date=date.today() + timedelta(days=25),
                    subtotal=plan.price,
                    total=plan.price,
                    status=invoice_status,
                )
                db.session.add(invoice)
                db.session.flush()

            transaction_reference = f"TX-DEMO-{index:03d}"
            if index == 1 and not Payment.query.filter_by(
                transaction_reference=transaction_reference
            ).first():
                db.session.add(
                    Payment(
                        invoice_id=invoice.id,
                        amount=invoice.total,
                        method="card",
                        transaction_reference=transaction_reference,
                        status="succeeded",
                    )
                )

        try:
            db.session.commit()
        except IntegrityError as error:
            db.session.rollback()
            raise click.ClickException("Could not seed the demo data.") from error

        click.echo("Demo customers, products, plans, quotations, subscriptions, invoices, and payments are ready.")

    @app.route("/staff/login", methods=["GET", "POST"])
    def staff_login():
        if request.method == "POST":
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            user = User.query.filter_by(email=email).first()

            if user is None or not check_password_hash(user.password_hash, password):
                return (
                    render_template_string(
                        LOGIN_TEMPLATE, error="Invalid email or password."
                    ),
                    401,
                )
            if user.role != "staff":
                session.clear()
                abort(403)

            session.clear()
            session["user_id"] = user.id
            return redirect(url_for("staff_dashboard"))

        return render_template_string(LOGIN_TEMPLATE, error=None)

    @app.route("/staff/logout", methods=["POST"])
    @role_required("staff")
    def staff_logout():
        session.clear()
        return redirect(url_for("staff_login"))

    @app.route("/staff/dashboard")
    @role_required("staff")
    def staff_dashboard():
        today = date.today()
        month_start = today.replace(day=1)
        first_chart_month = month_start
        for _ in range(5):
            first_chart_month = (first_chart_month.replace(day=1) - timedelta(days=1)).replace(day=1)

        revenue_months = []
        cursor = first_chart_month
        for _ in range(6):
            revenue_months.append(cursor)
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
        revenue_by_month = {month.strftime("%b"): Decimal("0.00") for month in revenue_months}

        successful_payments = Payment.query.filter_by(status="succeeded").all()
        first_revenue_date = revenue_months[0]
        for payment in successful_payments:
            payment_day = payment.payment_date.date()
            if payment_day >= first_revenue_date:
                month_label = payment_day.strftime("%b")
                if month_label in revenue_by_month:
                    revenue_by_month[month_label] += payment.amount

        recent_customers = (
            Customer.query.order_by(Customer.created_at.desc(), Customer.id.desc())
            .limit(5)
            .all()
        )
        upcoming_renewals = (
            Subscription.query.filter(
                Subscription.status.in_(("active", "trialing")),
                Subscription.next_billing_date >= today,
            )
            .order_by(Subscription.next_billing_date.asc())
            .limit(5)
            .all()
        )
        pending_invoices = (
            Invoice.query.filter(Invoice.status.in_(("open", "overdue")))
            .order_by(Invoice.due_date.asc())
            .limit(5)
            .all()
        )

        activities = []
        for customer in Customer.query.order_by(Customer.created_at.desc()).limit(5):
            activities.append({
                "date": customer.created_at.date(),
                "label": f"{customer.name} registered as a customer",
                "kind": "customer",
            })
        for quotation in Quotation.query.order_by(Quotation.created_at.desc()).limit(5):
            activities.append({
                "date": quotation.created_at.date(),
                "label": f"Quotation {quotation.quotation_number} was {quotation.status}",
                "kind": "quotation",
            })
        for subscription in Subscription.query.order_by(Subscription.created_at.desc()).limit(5):
            activities.append({
                "date": subscription.created_at.date(),
                "label": f"Subscription {subscription.subscription_code} was created",
                "kind": "subscription",
            })
        for invoice in Invoice.query.order_by(Invoice.issue_date.desc()).limit(5):
            activities.append({
                "date": invoice.issue_date,
                "label": f"Invoice {invoice.invoice_number} was issued",
                "kind": "invoice",
            })
        for payment in Payment.query.order_by(Payment.payment_date.desc()).limit(5):
            activities.append({
                "date": payment.payment_date.date(),
                "label": f"Payment of ${payment.amount:,.2f} was {payment.status}",
                "kind": "payment",
            })
        recent_activities = sorted(
            activities, key=lambda activity: activity["date"], reverse=True
        )[:6]

        return render_template(
            "staff/dashboard.html",
            total_customers=Customer.query.count(),
            active_subscriptions=Subscription.query.filter_by(status="active").count(),
            pending_invoice_count=Invoice.query.filter(
                Invoice.status.in_(("open", "overdue"))
            ).count(),
            payments_received=sum(
                (payment.amount for payment in successful_payments), Decimal("0.00")
            ),
            recent_activities=recent_activities,
            recent_customers=recent_customers,
            upcoming_renewals=upcoming_renewals,
            pending_invoices=pending_invoices,
            now_hour=datetime.now().hour,
            today_label=today.strftime("%A, %B %d, %Y"),
            revenue_data=[
                {"month": month.strftime("%b"), "total": float(revenue_by_month[month.strftime("%b")])}
                for month in revenue_months
            ],
        )

    @app.template_filter("currency")
    def format_currency(value):
        return f"${value:,.2f}"

    @app.context_processor
    def inject_staff_user():
        user_id = session.get("user_id")
        token = session.setdefault("_csrf_token", secrets.token_urlsafe(32))
        return {
            "staff_user": db.session.get(User, user_id) if user_id else None,
            "csrf_token": token,
        }

    @app.route("/staff/customers")
    @role_required("staff")
    def staff_customers():
        search = request.args.get("q", "").strip()
        status = request.args.get("status", "").strip().lower()
        page = max(request.args.get("page", 1, type=int), 1)
        per_page = 10
        query = Customer.query.options(selectinload(Customer.subscriptions))
        if search:
            filters = [
                Customer.name.ilike(f"%{search}%"),
                Customer.email.ilike(f"%{search}%"),
                Customer.phone.ilike(f"%{search}%"),
            ]
            if search.isdigit():
                filters.append(Customer.id == int(search))
            query = query.filter(or_(*filters))

        database_statuses = {
            value
            for value, in db.session.query(Subscription.lifecycle_status).distinct().all()
            if value
        }
        status_order = ("active", "confirmed", "quotation", "draft", "closed")
        ordered_statuses = [
            value for value in status_order if value in database_statuses
        ] + sorted(database_statuses.difference(status_order))
        customer_status_options = [
            (
                value,
                CUSTOMER_STATUS_LABELS.get(
                    value, value.replace("_", " ").title()
                ),
            )
            for value in ordered_statuses
        ]
        customer_status_options.append(("none", "No subscription"))

        if status == "none":
            query = query.filter(~Customer.subscriptions.any())
        elif status in database_statuses:
            query = query.filter(
                Customer.subscriptions.any(Subscription.lifecycle_status == status)
            )
        else:
            status = ""

        total = query.count()
        pages = max((total + per_page - 1) // per_page, 1)
        page = min(page, pages)
        customers = (
            query.order_by(Customer.id.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        return render_template(
            "staff/customers.html",
            customers=customers,
            customer_statuses={customer.id: _customer_status(customer) for customer in customers},
            customer_status_options=customer_status_options,
            search=search,
            status=status,
            page=page,
            pages=pages,
            total=total,
        )

    @app.route("/staff/customers/new", methods=["GET", "POST"])
    @role_required("staff")
    def staff_customer_create():
        if request.method == "POST":
            customer, errors = _customer_from_form()
            if not errors:
                db.session.add(customer)
                try:
                    db.session.commit()
                except IntegrityError:
                    db.session.rollback()
                    errors["email"] = "That email address is already in use."
                else:
                    flash("Customer created successfully.", "success")
                    return redirect(url_for("staff_customer_detail", customer_id=customer.id))
            for message in errors.values():
                flash(message, "error")
            return render_template("staff/customer_form.html", customer=None, form_data=request.form)

        return render_template("staff/customer_form.html", customer=None, form_data={})

    @app.route("/staff/customers/<int:customer_id>")
    @role_required("staff")
    def staff_customer_detail(customer_id):
        customer = Customer.query.options(
            selectinload(Customer.subscriptions).selectinload(Subscription.plan).selectinload(Plan.product),
            selectinload(Customer.quotations).selectinload(Quotation.plan).selectinload(Plan.product),
            selectinload(Customer.invoices).selectinload(Invoice.payments),
            selectinload(Customer.invoices).selectinload(Invoice.subscription),
        ).filter_by(id=customer_id).first_or_404()
        payments = [
            payment
            for invoice in customer.invoices
            for payment in invoice.payments
        ]
        return render_template(
            "staff/customer_detail.html",
            customer=customer,
            payments=sorted(payments, key=lambda payment: payment.payment_date, reverse=True),
            quotation_statuses={
                quotation.id: _effective_quotation_status(quotation)
                for quotation in customer.quotations
            },
        )

    @app.route("/staff/customers/<int:customer_id>/edit", methods=["GET", "POST"])
    @role_required("staff")
    def staff_customer_edit(customer_id):
        customer = Customer.query.filter_by(id=customer_id).first_or_404()
        if request.method == "POST":
            updated_customer, errors = _customer_from_form(existing_customer=customer)
            if not errors:
                customer.name = updated_customer.name
                customer.email = updated_customer.email
                customer.phone = updated_customer.phone
                customer.company_name = updated_customer.company_name
                customer.billing_address = updated_customer.billing_address
                try:
                    db.session.commit()
                except IntegrityError:
                    db.session.rollback()
                    errors["email"] = "That email address is already in use."
                else:
                    flash("Customer updated successfully.", "success")
                    return redirect(url_for("staff_customer_detail", customer_id=customer.id))
            for message in errors.values():
                flash(message, "error")
            return render_template(
                "staff/customer_form.html",
                customer=customer,
                form_data=request.form,
            )
        return render_template(
            "staff/customer_form.html", customer=customer, form_data={}
        )

    @app.route("/staff/quotations")
    @role_required("staff")
    def staff_quotations():
        search = request.args.get("q", "").strip()
        status = request.args.get("status", "").strip().lower()
        page = max(request.args.get("page", 1, type=int), 1)
        per_page = 10
        today = date.today()
        status_expression = _quotation_status_expression(today)
        query = Quotation.query.join(Customer).options(
            selectinload(Quotation.customer),
            selectinload(Quotation.plan).selectinload(Plan.product),
        )
        if search:
            query = query.filter(
                or_(
                    Quotation.quotation_number.ilike(f"%{search}%"),
                    Customer.name.ilike(f"%{search}%"),
                    Customer.email.ilike(f"%{search}%"),
                )
            )
        valid_statuses = {"draft", "sent", "accepted", "rejected", "expired"}
        if status in valid_statuses:
            query = query.filter(status_expression == status)
        else:
            status = ""

        total = query.count()
        pages = max((total + per_page - 1) // per_page, 1)
        page = min(page, pages)
        quotations = (
            query.order_by(Quotation.created_at.desc(), Quotation.id.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        return render_template(
            "staff/quotations.html",
            quotations=quotations,
            quotation_statuses={
                quotation.id: _effective_quotation_status(quotation, today)
                for quotation in quotations
            },
            search=search,
            status=status,
            page=page,
            pages=pages,
            total=total,
        )

    @app.route("/staff/quotations/new", methods=["GET", "POST"])
    @role_required("staff")
    def staff_quotation_create():
        customers = Customer.query.order_by(Customer.name.asc()).all()
        products = Product.query.filter_by(is_active=True).order_by(Product.name.asc()).all()
        plans = Plan.query.filter_by(is_active=True).order_by(Plan.name.asc()).all()
        plans_by_product = {
            str(plan.id): {
                "product_id": plan.product_id,
                "name": plan.name,
                "price": str(plan.price),
                "billing_cycle": plan.billing_cycle,
            }
            for plan in plans
        }
        form_data = request.form if request.method == "POST" else {}
        if request.method == "POST":
            errors = {}
            customer = db.session.get(Customer, _positive_int(request.form.get("customer_id")))
            product = db.session.get(Product, _positive_int(request.form.get("product_id")))
            plan = db.session.get(Plan, _positive_int(request.form.get("plan_id")))
            product_id = _positive_int(request.form.get("product_id"))
            quantity = _positive_int(request.form.get("quantity"))
            validity_value = request.form.get("valid_until", "").strip()

            if customer is None:
                errors["customer_id"] = "Choose a valid customer."
            if product is None or not product.is_active:
                errors["product_id"] = "Choose an active product."
            if plan is None or not plan.is_active:
                errors["plan_id"] = "Choose an active plan."
            elif product_id != plan.product_id or product is None or not product.is_active:
                errors["plan_id"] = "The selected plan does not belong to that product."
            if quantity is None or quantity > 1000:
                errors["quantity"] = "Quantity must be a whole number between 1 and 1000."
            try:
                valid_until = date.fromisoformat(validity_value)
                if valid_until < date.today():
                    errors["valid_until"] = "Validity date must be today or later."
            except ValueError:
                errors["valid_until"] = "Enter a valid validity date."

            if not errors:
                subtotal, tax, discount, total_amount = _calculate_quotation(plan, quantity)
                quotation = Quotation(
                    quotation_number=f"QT-{date.today():%Y%m%d}-{secrets.token_hex(3).upper()}",
                    customer_id=customer.id,
                    plan_id=plan.id,
                    created_by_id=session["user_id"],
                    status="draft",
                    quantity=quantity,
                    subtotal=subtotal,
                    tax=tax,
                    discount=discount,
                    amount=total_amount,
                    valid_until=valid_until,
                )
                db.session.add(quotation)
                try:
                    db.session.commit()
                except IntegrityError:
                    db.session.rollback()
                    flash("Could not save the quotation. Please try again.", "error")
                else:
                    flash("Quotation created successfully.", "success")
                    return redirect(
                        url_for("staff_quotation_detail", quotation_id=quotation.id)
                    )
            for message in errors.values():
                flash(message, "error")

        return render_template(
            "staff/quotation_form.html",
            customers=customers,
            products=products,
            plans=plans,
            plans_by_product=plans_by_product,
            form_data=form_data,
            today_iso=date.today().isoformat(),
            default_valid_until=(date.today() + timedelta(days=30)).isoformat(),
            tax_rate=0,
            discount_rate=0,
        )

    @app.route("/staff/quotations/<int:quotation_id>")
    @role_required("staff")
    def staff_quotation_detail(quotation_id):
        quotation = Quotation.query.options(
            selectinload(Quotation.customer),
            selectinload(Quotation.plan).selectinload(Plan.product),
        ).filter_by(id=quotation_id).first_or_404()
        effective_status = _effective_quotation_status(quotation)
        transitions = {
            "draft": ("sent",),
            "sent": ("accepted", "rejected"),
        }
        return render_template(
            "staff/quotation_detail.html",
            quotation=quotation,
            status=effective_status,
            allowed_transitions=transitions.get(effective_status, ()),
            converted_subscription=Subscription.query.filter_by(
                quotation_id=quotation.id
            ).first(),
        )

    @app.route("/staff/quotations/<int:quotation_id>/status", methods=["POST"])
    @role_required("staff")
    def staff_quotation_update_status(quotation_id):
        quotation = Quotation.query.filter_by(id=quotation_id).first_or_404()
        current_status = _effective_quotation_status(quotation)
        transitions = {
            "draft": ("sent",),
            "sent": ("accepted", "rejected"),
        }
        new_status = request.form.get("status", "").strip().lower()
        if new_status not in transitions.get(current_status, ()):
            flash("That quotation status transition is not allowed.", "error")
        else:
            quotation.status = new_status
            db.session.commit()
            flash(f"Quotation marked {new_status}.", "success")
        return redirect(url_for("staff_quotation_detail", quotation_id=quotation.id))

    @app.route("/staff/quotations/<int:quotation_id>/convert", methods=["POST"])
    @role_required("staff")
    def staff_quotation_convert(quotation_id):
        quotation = Quotation.query.options(
            selectinload(Quotation.plan)
        ).filter_by(id=quotation_id).first_or_404()
        if quotation.status != "accepted":
            flash("Only accepted quotations can be converted.", "error")
            return redirect(url_for("staff_quotation_detail", quotation_id=quotation.id))

        existing_subscription = Subscription.query.filter_by(
            quotation_id=quotation.id
        ).first()
        if existing_subscription:
            flash("This quotation has already been converted.", "error")
            return redirect(
                url_for(
                    "staff_subscription_detail",
                    subscription_id=existing_subscription.id,
                )
            )

        next_billing_date = _add_billing_cycle(
            date.today(), quotation.plan.billing_cycle
        )
        subscription = Subscription(
            subscription_code=f"SUB-{date.today():%Y%m%d}-{secrets.token_hex(3).upper()}",
            customer_id=quotation.customer_id,
            plan_id=quotation.plan_id,
            quotation_id=quotation.id,
            lifecycle_status="quotation",
            quantity=quotation.quantity,
            amount=quotation.amount,
            status="trialing",
            start_date=date.today(),
            next_billing_date=next_billing_date,
        )
        db.session.add(subscription)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            flash("This quotation was already converted.", "error")
            existing_subscription = Subscription.query.filter_by(
                quotation_id=quotation.id
            ).first()
            if existing_subscription:
                return redirect(
                    url_for(
                        "staff_subscription_detail",
                        subscription_id=existing_subscription.id,
                    )
                )
            return redirect(url_for("staff_quotation_detail", quotation_id=quotation.id))
        flash("Accepted quotation converted to a subscription.", "success")
        return redirect(
            url_for("staff_subscription_detail", subscription_id=subscription.id)
        )

    @app.route("/staff/subscriptions")
    @role_required("staff")
    def staff_subscriptions():
        search = request.args.get("q", "").strip()
        status = request.args.get("status", "").strip().lower()
        billing_cycle = request.args.get("billing_cycle", "").strip().lower()
        expiring_soon = request.args.get("expiring_soon", "").strip() == "1"
        page = max(request.args.get("page", 1, type=int), 1)
        per_page = 10
        query = Subscription.query.join(Customer).join(Plan).join(Product).options(
            selectinload(Subscription.customer),
            selectinload(Subscription.plan).selectinload(Plan.product),
        )
        if search:
            matches = [
                Subscription.subscription_code.ilike(f"%{search}%"),
                Customer.name.ilike(f"%{search}%"),
                Plan.name.ilike(f"%{search}%"),
                Product.name.ilike(f"%{search}%"),
            ]
            if search.isdigit():
                matches.append(Subscription.id == int(search))
            query = query.filter(or_(*matches))

        subscription_statuses = ("draft", "quotation", "confirmed", "active", "closed")
        if status in subscription_statuses:
            query = query.filter(Subscription.lifecycle_status == status)
        else:
            status = ""
        if billing_cycle in ("monthly", "quarterly", "yearly", "one_time"):
            query = query.filter(Plan.billing_cycle == billing_cycle)
        else:
            billing_cycle = ""
        if expiring_soon:
            query = query.filter(
                Subscription.lifecycle_status != "closed",
                Subscription.end_date.isnot(None),
                Subscription.end_date >= date.today(),
                Subscription.end_date <= _subscription_expiring_cutoff(),
            )

        total = query.count()
        pages = max((total + per_page - 1) // per_page, 1)
        page = min(page, pages)
        subscriptions = (
            query.order_by(Subscription.id.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        return render_template(
            "staff/subscriptions.html",
            subscriptions=subscriptions,
            search=search,
            status=status,
            billing_cycle=billing_cycle,
            expiring_soon=expiring_soon,
            statuses=subscription_statuses,
            billing_cycles=("monthly", "quarterly", "yearly", "one_time"),
            page=page,
            pages=pages,
            total=total,
        )

    @app.route("/staff/subscriptions/<int:subscription_id>")
    @role_required("staff")
    def staff_subscription_detail(subscription_id):
        subscription = Subscription.query.options(
            selectinload(Subscription.customer),
            selectinload(Subscription.plan).selectinload(Plan.product),
            selectinload(Subscription.invoices),
        ).filter_by(id=subscription_id).first_or_404()
        transitions = {
            "draft": ("quotation",),
            "quotation": ("confirmed",),
            "confirmed": ("active",),
            "active": ("closed",),
        }
        return render_template(
            "staff/subscription_detail.html",
            subscription=subscription,
            allowed_transitions=transitions.get(subscription.lifecycle_status, ()),
            invoice_status_labels={
                invoice.id: _invoice_status_label(invoice.status)
                for invoice in subscription.invoices
            },
        )

    @app.route(
        "/staff/subscriptions/<int:subscription_id>/status", methods=["POST"]
    )
    @role_required("staff")
    def staff_subscription_update_status(subscription_id):
        subscription = Subscription.query.filter_by(id=subscription_id).first_or_404()
        transitions = {
            "draft": ("quotation",),
            "quotation": ("confirmed",),
            "confirmed": ("active",),
            "active": ("closed",),
        }
        current_status = subscription.lifecycle_status
        new_status = request.form.get("status", "").strip().lower()
        if new_status not in transitions.get(current_status, ()):
            flash("That subscription status transition is not allowed.", "error")
        else:
            subscription.lifecycle_status = new_status
            subscription.status = {
                "draft": "trialing",
                "quotation": "trialing",
                "confirmed": "past_due",
                "active": "active",
                "closed": "canceled",
            }[new_status]
            if new_status == "active" and subscription.next_billing_date is None:
                subscription.next_billing_date = _add_billing_cycle(
                    subscription.start_date, subscription.plan.billing_cycle
                )
            if new_status == "closed":
                subscription.end_date = date.today()
            db.session.commit()
            flash(f"Subscription marked {new_status}.", "success")
        return redirect(
            url_for("staff_subscription_detail", subscription_id=subscription.id)
        )

    @app.route(
        "/staff/subscriptions/<int:subscription_id>/invoices/new",
        methods=["GET", "POST"],
    )
    @role_required("staff")
    def staff_invoice_create(subscription_id):
        subscription = Subscription.query.options(
            selectinload(Subscription.customer),
            selectinload(Subscription.plan),
        ).filter_by(id=subscription_id).first_or_404()
        if subscription.lifecycle_status not in ("confirmed", "active"):
            abort(400, description="Invoices can only be generated for confirmed or active subscriptions.")

        next_period_start = subscription.next_billing_date or date.today()
        next_period_end = _add_billing_cycle(
            next_period_start, subscription.plan.billing_cycle
        )
        if next_period_end is None:
            next_period_end = next_period_start + timedelta(days=1)
        default_due_date = date.today() + timedelta(days=14)
        form_data = request.form if request.method == "POST" else {}
        if request.method == "POST":
            errors = {}
            try:
                period_start = date.fromisoformat(
                    request.form.get("billing_period_start", "").strip()
                )
                period_end = date.fromisoformat(
                    request.form.get("billing_period_end", "").strip()
                )
                due_date = date.fromisoformat(request.form.get("due_date", "").strip())
                if period_end <= period_start:
                    errors["billing_period_end"] = "Period end must be after period start."
                if due_date < date.today():
                    errors["due_date"] = "Due date must be today or later."
            except ValueError:
                errors["dates"] = "Enter valid billing period and due dates."
            if not errors:
                duplicate = Invoice.query.filter_by(
                    subscription_id=subscription.id,
                    billing_period_start=period_start,
                    billing_period_end=period_end,
                ).first()
                if duplicate:
                    errors["duplicate"] = "An invoice already exists for this billing period."
            if not errors:
                total_amount = Decimal(subscription.amount).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
                invoice = Invoice(
                    invoice_number=f"INV-{date.today():%Y%m%d}-{secrets.token_hex(3).upper()}",
                    customer_id=subscription.customer_id,
                    subscription_id=subscription.id,
                    billing_period_start=period_start,
                    billing_period_end=period_end,
                    issue_date=date.today(),
                    due_date=due_date,
                    subtotal=total_amount,
                    tax=Decimal("0.00"),
                    total=total_amount,
                    status="draft",
                )
                db.session.add(invoice)
                try:
                    db.session.commit()
                except IntegrityError:
                    db.session.rollback()
                    flash("An invoice already exists for this billing period.", "error")
                else:
                    flash("Invoice generated successfully.", "success")
                    return redirect(
                        url_for("staff_invoice_detail", invoice_id=invoice.id)
                    )
            for message in errors.values():
                flash(message, "error")
        return render_template(
            "staff/invoice_form.html",
            subscription=subscription,
            form_data=form_data,
            default_period_start=next_period_start.isoformat(),
            default_period_end=(next_period_end - timedelta(days=1)).isoformat(),
            default_due_date=default_due_date.isoformat(),
            today_iso=date.today().isoformat(),
        )

    @app.route("/staff/invoices")
    @role_required("staff")
    def staff_invoices():
        search = request.args.get("q", "").strip()
        status = request.args.get("status", "").strip().lower()
        page = max(request.args.get("page", 1, type=int), 1)
        per_page = 10
        query = Invoice.query.join(Customer).options(
            selectinload(Invoice.customer),
            selectinload(Invoice.subscription),
        )
        if search:
            matches = [
                Invoice.invoice_number.ilike(f"%{search}%"),
                Customer.name.ilike(f"%{search}%"),
            ]
            if search.isdigit():
                matches.append(Invoice.id == int(search))
            query = query.filter(or_(*matches))
        invoice_statuses = ("draft", "confirmed", "paid")
        if status in invoice_statuses:
            if status == "confirmed":
                query = query.filter(Invoice.status.in_(("open", "overdue")))
            else:
                query = query.filter(Invoice.status == status)
        else:
            status = ""
        total = query.count()
        pages = max((total + per_page - 1) // per_page, 1)
        page = min(page, pages)
        invoices = (
            query.order_by(Invoice.issue_date.desc(), Invoice.id.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        return render_template(
            "staff/invoices.html",
            invoices=invoices,
            invoice_statuses={invoice.id: _invoice_status_label(invoice.status) for invoice in invoices},
            search=search,
            status=status,
            page=page,
            pages=pages,
            total=total,
            statuses=invoice_statuses,
        )

    @app.route("/staff/invoices/<int:invoice_id>")
    @role_required("staff")
    def staff_invoice_detail(invoice_id):
        invoice = Invoice.query.options(
            selectinload(Invoice.customer),
            selectinload(Invoice.subscription).selectinload(Subscription.plan),
            selectinload(Invoice.payments),
        ).filter_by(id=invoice_id).first_or_404()
        transitions = {
            "draft": ("confirmed",),
            "open": ("paid",),
            "overdue": ("paid",),
        }
        return render_template(
            "staff/invoice_detail.html",
            invoice=invoice,
            payment_status=_invoice_status_label(invoice.status),
            allowed_transitions=transitions.get(invoice.status, ()),
        )

    @app.route("/staff/invoices/<int:invoice_id>/status", methods=["POST"])
    @role_required("staff")
    def staff_invoice_update_status(invoice_id):
        invoice = Invoice.query.filter_by(id=invoice_id).first_or_404()
        transitions = {
            "draft": ("confirmed",),
            "open": ("paid",),
            "overdue": ("paid",),
        }
        requested_status = request.form.get("status", "").strip().lower()
        allowed = transitions.get(invoice.status, ())
        if requested_status not in allowed:
            flash("That invoice status transition is not allowed.", "error")
        else:
            invoice.status = "open" if requested_status == "confirmed" else requested_status
            if requested_status == "paid":
                invoice.paid_at = datetime.now().astimezone()
            db.session.commit()
            flash(f"Invoice marked {requested_status}.", "success")
        return redirect(url_for("staff_invoice_detail", invoice_id=invoice.id))

    @app.route("/staff/invoices/<int:invoice_id>/send", methods=["POST"])
    @role_required("staff")
    def staff_invoice_send(invoice_id):
        invoice = Invoice.query.filter_by(id=invoice_id).first_or_404()
        if invoice.status == "paid":
            flash("Paid invoices cannot be sent again.", "error")
        else:
            invoice.sent_at = datetime.now().astimezone()
            db.session.commit()
            flash("Invoice marked as sent. No email was sent.", "success")
        return redirect(url_for("staff_invoice_detail", invoice_id=invoice.id))

    @app.route("/staff/invoices/<int:invoice_id>/pdf")
    @role_required("staff")
    def staff_invoice_pdf(invoice_id):
        invoice = Invoice.query.options(
            selectinload(Invoice.customer)
        ).filter_by(id=invoice_id).first_or_404()
        response = make_response(_invoice_pdf(invoice))
        response.headers["Content-Type"] = "application/pdf"
        response.headers["Content-Disposition"] = (
            f'attachment; filename="{invoice.invoice_number}.pdf"'
        )
        return response

    @app.route("/staff/payments")
    @role_required("staff")
    def staff_payments():
        return render_template("staff/placeholder.html", title="Payments", description="Review payment activity and transaction status here.")

    @app.route("/staff/reports")
    @role_required("staff")
    def staff_reports():
        return render_template("staff/placeholder.html", title="Reports", description="Subscription and revenue reports will be available here.")

    return app


LOGIN_TEMPLATE = """<!doctype html>
<title>Staff login</title>
<h1>Staff login</h1>
{% if error %}<p role="alert">{{ error }}</p>{% endif %}
<form method="post">
  <input type="hidden" name="csrf_token" value="{{ csrf_token }}">
  <label>Email <input type="email" name="email" required></label>
  <label>Password <input type="password" name="password" required></label>
  <button type="submit">Log in</button>
</form>
"""
