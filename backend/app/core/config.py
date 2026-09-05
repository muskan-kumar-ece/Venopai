from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "VenopAI"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/venopai"
    
    class Config:
        env_file = ".env"

settings = Settings()
