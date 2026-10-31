# Subscription-Management-System

## Staff dashboard foundation

Use the existing virtual environment from PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:SECRET_KEY = (python -c "import secrets; print(secrets.token_hex(32))")
$env:FLASK_APP = "app:create_app"
flask create-staff
flask seed-demo
flask run --port 5002
```

The project-wide login is at `http://127.0.0.1:5002/login`. After signing in, staff users can open the staff dashboard.
The SQLite database is created at `instance/staff_dashboard.db`.
Staff Dashboard prices, invoices, and payments are displayed in Indian rupees (INR). Existing stored numeric amounts are preserved. Invoice PDFs embed the OFL-licensed Noto Sans font in `static/fonts/` so the rupee glyph renders correctly; see `static/fonts/OFL.txt` for its license.

## Staff customers and quotations

Staff can search, filter, and manage customer records at `/staff/customers`, and create and track quotations at `/staff/quotations`. Quotation totals use the selected plan price and quantity. The current database has no tax-rate or discount-rule values, so those amounts are calculated as zero until rules are configured elsewhere.

## Staff subscriptions and invoices

Manage subscription lifecycle and renewals at `/staff/subscriptions`. Accepted quotations can be converted into subscriptions, and confirmed or active subscriptions can generate one invoice per billing period. Invoices can be confirmed, marked paid, printed, downloaded as PDF, and marked sent; sending records the date without sending email.

## Staff dashboard setup, run, and tests

From the project folder in PowerShell, create and activate the virtual environment (skip creation if `.venv` already exists), then install the project requirements:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Set a private session secret and configure the Flask application:

```powershell
$env:SECRET_KEY = (python -c "import secrets; print(secrets.token_hex(32))")
$env:FLASK_APP = "app:create_app"
```

Create a staff login and load the repeatable demo data:

```powershell
flask create-staff
flask seed-demo
```

Run the staff dashboard on port 5002 and open `http://127.0.0.1:5002/login`:

```powershell
flask run --port 5002
```

Run the automated staff tests with:

```powershell
python -m pytest
```

For local staff-module development only, set `$env:STAFF_DEV_MODE = "1"` before starting Flask to open staff pages without a login session. This uses the first staff account in the database. Keep `STAFF_DEV_MODE` OFF in production and when this module is merged into the project; the staff module then redirects unauthenticated users to `LOGIN_URL` (default `/login`).