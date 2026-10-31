import os
import secrets
from datetime import date, timedelta
from decimal import Decimal

import click
from flask import Flask, abort, redirect, render_template_string, request, session, url_for
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
        user = db.session.get(User, session["user_id"])
        return render_template_string(DASHBOARD_TEMPLATE, name=user.name)

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

DASHBOARD_TEMPLATE = """<!doctype html>
<title>Staff dashboard</title>
<p>Welcome, {{ name }}</p>
<form method="post" action="{{ url_for('staff_logout') }}">
  <button type="submit">Log out</button>
</form>
"""
