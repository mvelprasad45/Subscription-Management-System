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
flask run
```

Open `http://127.0.0.1:5000/staff/login` and sign in with the staff account.
The SQLite database is created at `instance/staff_dashboard.db`.