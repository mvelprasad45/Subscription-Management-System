import re
from datetime import date, timedelta
from decimal import Decimal

import pytest
from werkzeug.security import check_password_hash, generate_password_hash

from app import create_app
from models import Customer, Invoice, Payment, Plan, Product, Quotation, Subscription, User, db


@pytest.fixture
def app(tmp_path):
    database_path = tmp_path / "staff-test.db"
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-only-secret-key",
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{database_path}",
        }
    )
    yield app
    with app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def records(app):
    with app.app_context():
        staff = User(
            name="Staff Tester",
            email="staff@example.test",
            password_hash=generate_password_hash("staff-password"),
            role="staff",
        )
        admin = User(
            name="Admin Tester",
            email="admin@example.test",
            password_hash=generate_password_hash("admin-password"),
            role="admin",
        )
        customer_user = User(
            name="Customer Tester",
            email="user@example.test",
            password_hash=generate_password_hash("customer-password"),
            role="customer",
        )
        customer = Customer(name="Test Customer", email="customer@example.test")
        db.session.add_all((staff, admin, customer_user, customer))
        db.session.flush()

        product = Product(name="Test Product")
        db.session.add(product)
        db.session.flush()
        plan = Plan(
            product_id=product.id,
            name="Test Monthly",
            price=Decimal("39.99"),
            billing_cycle="monthly",
        )
        db.session.add(plan)
        db.session.flush()
        subscription = Subscription(
            subscription_code="SUB-TEST-001",
            customer_id=customer.id,
            plan_id=plan.id,
            lifecycle_status="confirmed",
            status="past_due",
            quantity=1,
            amount=Decimal("39.99"),
            start_date=date.today(),
        )
        db.session.add(subscription)
        db.session.flush()
        invoice = Invoice(
            invoice_number="INV-TEST-001",
            customer_id=customer.id,
            subscription_id=subscription.id,
            issue_date=date.today(),
            due_date=date.today() + timedelta(days=14),
            subtotal=Decimal("100.00"),
            tax=Decimal("0.00"),
            total=Decimal("100.00"),
            status="open",
        )
        db.session.add(invoice)
        db.session.commit()
        return {
            "staff_id": staff.id,
            "admin_id": admin.id,
            "customer_user_id": customer_user.id,
            "customer_id": customer.id,
            "product_id": product.id,
            "plan_id": plan.id,
            "subscription_id": subscription.id,
            "invoice_id": invoice.id,
            "invoice_total": invoice.total,
        }


def csrf_token(client):
    client.get("/staff/login")
    with client.session_transaction() as session:
        return session["_csrf_token"]


def login(client, email, password):
    token = csrf_token(client)
    return client.post(
        "/staff/login",
        data={"csrf_token": token, "email": email, "password": password},
    )


def route_path(rule):
    return re.sub(r"<(?:[^:>]+:)?[^>]+>", "1", rule)


def authenticate_as(client, user_id):
    with client.session_transaction() as session:
        session["user_id"] = user_id
        session["_csrf_token"] = "test-csrf-token"


def test_secret_key_uses_environment_variable(tmp_path, monkeypatch):
    secret = "environment-provided-test-secret"
    monkeypatch.setenv("SECRET_KEY", secret)
    app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{(tmp_path / 'secret-test.db').as_posix()}",
        }
    )
    assert app.secret_key == secret
    with app.app_context():
        db.session.remove()
        db.drop_all()


def test_login_success_failure_and_password_hashing(client, app, records):
    login_page = client.get("/staff/login")
    assert login_page.status_code == 200
    assert b"Welcome back" in login_page.data
    assert b"Make good" in login_page.data

    failed = login(client, "staff@example.test", "wrong-password")
    assert failed.status_code == 401
    assert b"Invalid email or password" in failed.data

    succeeded = login(client, "staff@example.test", "staff-password")
    assert succeeded.status_code == 302
    assert succeeded.headers["Location"].endswith("/staff/dashboard")
    with app.app_context():
        user = db.session.get(User, records["staff_id"])
        assert check_password_hash(user.password_hash, "staff-password")
        assert user.password_hash != "staff-password"


def test_every_staff_route_blocks_anonymous_and_nonstaff_users(app, records):
    rules = [
        rule
        for rule in app.url_map.iter_rules()
        if rule.rule.startswith("/staff/") and rule.endpoint != "staff_login"
    ]
    assert rules
    for rule in rules:
        assert hasattr(app.view_functions[rule.endpoint], "__wrapped__"), rule.endpoint

    anonymous = app.test_client()
    admin = app.test_client()
    customer = app.test_client()
    authenticate_as(admin, records["admin_id"])
    authenticate_as(customer, records["customer_user_id"])

    for rule in rules:
        path = route_path(rule.rule)
        if "GET" in rule.methods:
            assert anonymous.get(path).status_code == 302, path
            assert admin.get(path).status_code == 403, path
            assert customer.get(path).status_code == 403, path
        if "POST" in rule.methods:
            assert anonymous.post(path).status_code == 302, path
            assert admin.post(path).status_code == 403, path
            assert customer.post(path).status_code == 403, path


def test_every_staff_post_requires_csrf(client, app, records):
    authenticate_as(client, records["staff_id"])
    post_rules = [
        rule
        for rule in app.url_map.iter_rules()
        if rule.rule.startswith("/staff/") and "POST" in rule.methods
    ]
    for rule in post_rules:
        response = client.post(route_path(rule.rule), data={})
        assert response.status_code == 400, rule.rule


def test_staff_has_no_admin_settings_or_account_routes(app, client, records):
    restricted_terms = ("admin", "settings", "tax", "discount", "users", "create-staff")
    staff_routes = [
        rule.rule.lower()
        for rule in app.url_map.iter_rules()
        if rule.rule.startswith("/staff/")
    ]
    assert not any(term in path for path in staff_routes for term in restricted_terms)

    authenticate_as(client, records["staff_id"])
    for path in ("/staff/settings", "/staff/tax", "/staff/discounts", "/staff/users"):
        assert client.get(path).status_code == 404


def test_customer_validation_and_duplicate_email(client, records):
    authenticate_as(client, records["staff_id"])
    token = csrf_token(client)
    invalid = client.post(
        "/staff/customers/new",
        data={"csrf_token": token, "name": "", "email": "not-an-email"},
    )
    assert invalid.status_code == 200
    assert b"Name is required" in invalid.data
    assert b"Enter a valid email address" in invalid.data
    oversized_address = client.post(
        "/staff/customers/new",
        data={
            "csrf_token": token,
            "name": "Long Address",
            "email": "long-address@example.test",
            "billing_address": "A" * 2001,
        },
    )
    assert oversized_address.status_code == 200
    assert b"Billing address must be 2000 characters or fewer" in oversized_address.data

    duplicate = client.post(
        "/staff/customers/new",
        data={
            "csrf_token": token,
            "name": "Duplicate",
            "email": "customer@example.test",
        },
    )
    assert duplicate.status_code == 200
    assert b"already in use" in duplicate.data


def test_quotation_calculation_is_recomputed_server_side(client, app, records):
    authenticate_as(client, records["staff_id"])
    response = client.post(
        "/staff/quotations/new",
        data={
            "csrf_token": csrf_token(client),
            "customer_id": records["customer_id"],
            "product_id": records["product_id"],
            "plan_id": records["plan_id"],
            "quantity": "3",
            "valid_until": (date.today() + timedelta(days=30)).isoformat(),
            "tax": "1000",
            "discount": "1000",
        },
    )
    assert response.status_code == 302
    with app.app_context():
        quotation = Quotation.query.one()
        assert quotation.subtotal == Decimal("119.97")
        assert quotation.tax == Decimal("0.00")
        assert quotation.discount == Decimal("0.00")
        assert quotation.amount == Decimal("119.97")


def test_duplicate_invoice_period_is_rejected(client, app, records):
    authenticate_as(client, records["staff_id"])
    start = date.today() + timedelta(days=1)
    end = start + timedelta(days=29)
    data = {
        "csrf_token": csrf_token(client),
        "billing_period_start": start.isoformat(),
        "billing_period_end": end.isoformat(),
        "due_date": (date.today() + timedelta(days=14)).isoformat(),
    }
    url = f"/staff/subscriptions/{records['subscription_id']}/invoices/new"
    first = client.post(url, data=data)
    assert first.status_code == 302
    second = client.post(url, data=data)
    assert second.status_code == 200
    assert b"already exists for this billing period" in second.data
    with app.app_context():
        assert Invoice.query.filter_by(
            subscription_id=records["subscription_id"],
            billing_period_start=start,
            billing_period_end=end,
        ).count() == 1


def test_payment_rejects_overpayment_and_paid_invoice(client, app, records):
    authenticate_as(client, records["staff_id"])
    token = csrf_token(client)
    url = "/staff/payments/new"
    payment_data = {
        "csrf_token": token,
        "invoice_id": records["invoice_id"],
        "amount": "100.01",
        "method": "card",
        "payment_date": date.today().isoformat(),
    }
    overpayment = client.post(url, data=payment_data)
    assert overpayment.status_code == 200
    assert b"cannot exceed the remaining balance" in overpayment.data
    with app.app_context():
        assert Payment.query.filter_by(invoice_id=records["invoice_id"]).count() == 0

    payment_data["amount"] = "100.00"
    paid = client.post(url, data=payment_data)
    assert paid.status_code == 302
    with app.app_context():
        invoice = db.session.get(Invoice, records["invoice_id"])
        assert invoice.status == "paid"
        assert Payment.query.filter_by(invoice_id=records["invoice_id"]).count() == 1

    rejected = client.post(url, data=payment_data)
    assert rejected.status_code == 200
    assert b"Paid invoices cannot be paid again" in rejected.data
    with app.app_context():
        assert Payment.query.filter_by(invoice_id=records["invoice_id"]).count() == 1
