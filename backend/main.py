from fastapi import FastAPI

from app.main import create_app


app = FastAPI()
app = create_app()
