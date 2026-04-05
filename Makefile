setup:
	pip install -r requirements.txt
	cd frontend && npm install
	playwright install chromium

dev:
	uvicorn backend.main:app --reload --port 8000 &
	cd frontend && npm run dev

backend:
	uvicorn backend.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

db-init:
	python -c "from backend.database import init_db; import asyncio; asyncio.run(init_db())"

db-reset:
	rm -f data/local.db
	python -c "from backend.database import init_db; import asyncio; asyncio.run(init_db())"
