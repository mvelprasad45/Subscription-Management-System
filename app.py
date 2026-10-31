import os
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal

import click
from flask import Flask, abort, redirect, render_template, render_template_string, request, session, url_for
from functools import wraps
from sqlalchemy.exc import IntegrityError
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
        return {"staff_user": db.session.get(User, user_id) if user_id else None}

    @app.route("/staff/customers")
    @role_required("staff")
    def staff_customers():
        return render_template("staff/placeholder.html", title="Customers", description="Customer records and account details will appear here.")

    @app.route("/staff/quotations")
    @role_required("staff")
    def staff_quotations():
        return render_template("staff/placeholder.html", title="Quotations", description="Create and track customer quotations here.")

    @app.route("/staff/subscriptions")
    @role_required("staff")
    def staff_subscriptions():
        return render_template("staff/placeholder.html", title="Subscriptions", description="Manage active plans and upcoming renewals here.")

    @app.route("/staff/invoices")
    @role_required("staff")
    def staff_invoices():
        return render_template("staff/placeholder.html", title="Invoices", description="Review invoice status, due dates, and billing history here.")

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
  <label>Email <input type="email" name="email" required></label>
  <label>Password <input type="password" name="password" required></label>
  <button type="submit">Log in</button>
</form>
"""
