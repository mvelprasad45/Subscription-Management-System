from datetime import date, datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import CheckConstraint, UniqueConstraint


db = SQLAlchemy()


def utc_now():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('admin', 'staff', 'customer')",
            name="check_user_role",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="customer")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    quotations = db.relationship("Quotation", back_populates="created_by")


class Customer(db.Model):
    __tablename__ = "customers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    phone = db.Column(db.String(40))
    company_name = db.Column(db.String(160))
    billing_address = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    quotations = db.relationship("Quotation", back_populates="customer")
    subscriptions = db.relationship("Subscription", back_populates="customer")
    invoices = db.relationship("Invoice", back_populates="customer")


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False, unique=True)
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    plans = db.relationship("Plan", back_populates="product")


class Plan(db.Model):
    __tablename__ = "plans"
    __table_args__ = (
        CheckConstraint(
            "billing_cycle IN ('monthly', 'quarterly', 'yearly', 'one_time')",
            name="check_plan_billing_cycle",
        ),
        CheckConstraint("price >= 0", name="check_plan_price_nonnegative"),
    )

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    name = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    billing_cycle = db.Column(db.String(20), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    product = db.relationship("Product", back_populates="plans")
    quotations = db.relationship("Quotation", back_populates="plan")
    subscriptions = db.relationship("Subscription", back_populates="plan")


class Quotation(db.Model):
    __tablename__ = "quotations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')",
            name="check_quotation_status",
        ),
        CheckConstraint("amount >= 0", name="check_quotation_amount_nonnegative"),
    )

    id = db.Column(db.Integer, primary_key=True)
    quotation_number = db.Column(db.String(40), nullable=False, unique=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    status = db.Column(db.String(20), nullable=False, default="draft")
    quantity = db.Column(db.Integer, nullable=False, default=1)
    subtotal = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    tax = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    discount = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    valid_until = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    customer = db.relationship("Customer", back_populates="quotations")
    plan = db.relationship("Plan", back_populates="quotations")
    created_by = db.relationship("User", back_populates="quotations")
    subscription = db.relationship("Subscription", back_populates="quotation", uselist=False)


class Subscription(db.Model):
    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')",
            name="check_subscription_status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    subscription_code = db.Column(db.String(40), nullable=False, unique=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=False)
    quotation_id = db.Column(
        db.Integer, db.ForeignKey("quotations.id"), unique=True
    )
    lifecycle_status = db.Column("workflow_status", db.String(20), nullable=False, default="draft")
    quantity = db.Column(db.Integer, nullable=False, default=1)
    amount = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="active")
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date)
    next_billing_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    customer = db.relationship("Customer", back_populates="subscriptions")
    plan = db.relationship("Plan", back_populates="subscriptions")
    quotation = db.relationship("Quotation", back_populates="subscription")
    invoices = db.relationship("Invoice", back_populates="subscription")


class Invoice(db.Model):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint(
            "subscription_id",
            "billing_period_start",
            "billing_period_end",
            name="uq_invoice_subscription_billing_period",
        ),
        CheckConstraint(
            "status IN ('draft', 'open', 'paid', 'overdue', 'void')",
            name="check_invoice_status",
        ),
        CheckConstraint("subtotal >= 0", name="check_invoice_subtotal_nonnegative"),
        CheckConstraint("tax >= 0", name="check_invoice_tax_nonnegative"),
        CheckConstraint("total >= 0", name="check_invoice_total_nonnegative"),
    )

    id = db.Column(db.Integer, primary_key=True)
    invoice_number = db.Column(db.String(40), nullable=False, unique=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    subscription_id = db.Column(db.Integer, db.ForeignKey("subscriptions.id"))
    billing_period_start = db.Column(db.Date)
    billing_period_end = db.Column(db.Date)
    issue_date = db.Column(db.Date, nullable=False, default=date.today)
    due_date = db.Column(db.Date, nullable=False)
    paid_at = db.Column(db.DateTime(timezone=True))
    sent_at = db.Column(db.DateTime(timezone=True))
    subtotal = db.Column(db.Numeric(10, 2), nullable=False)
    tax = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    total = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="draft")

    customer = db.relationship("Customer", back_populates="invoices")
    subscription = db.relationship("Subscription", back_populates="invoices")
    payments = db.relationship("Payment", back_populates="invoice")


class Payment(db.Model):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'refunded')",
            name="check_payment_status",
        ),
        CheckConstraint("amount >= 0", name="check_payment_amount_nonnegative"),
    )

    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey("invoices.id"), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_date = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    method = db.Column(db.String(40), nullable=False)
    transaction_reference = db.Column(db.String(120), unique=True)
    notes = db.Column(db.Text)
    status = db.Column(db.String(20), nullable=False, default="pending")

    invoice = db.relationship("Invoice", back_populates="payments")
