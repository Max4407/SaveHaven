# Savehaven

Setup:

Backend setup

From PowerShell:
cd backend

py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
python -m pip install "fastapi[standard-no-fastapi-cloud-cli]" sqlalchemy pydantic-settings httpx itsdangerous python-dotenv
python -m pip install pytest pytest-asyncio ruff

Frontend setup

cd frontend

npm install react-router-dom @tanstack/react-query recharts phaser
npm install tailwindcss @tailwindcss/vite
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
