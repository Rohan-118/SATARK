from pathlib import Path


# -----------------------------------------------------------------------------
# Base directory
# -----------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent


# -----------------------------------------------------------------------------
# Security
# -----------------------------------------------------------------------------

SECRET_KEY = "django-insecure-satark-development-key"

DEBUG = True

ALLOWED_HOSTS = [
    "127.0.0.1",
    "localhost",
]


# -----------------------------------------------------------------------------
# Application definition
# -----------------------------------------------------------------------------

INSTALLED_APPS = [
    "corsheaders",
    # Django framework applications
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.messages",

    # Django REST Framework
    "rest_framework",

    # SATARK applications
    "core.apps.CoreConfig",
    "twin.apps.TwinConfig",
    "agents.apps.AgentsConfig",
    "infrastructure.apps.InfrastructureConfig",
    "calamities.apps.CalamitiesConfig",
    "simulation.apps.SimulationConfig",
    "ml.apps.MLConfig",
    "cascade.apps.CascadeConfig",
    "risk.apps.RiskConfig",
    "decision.apps.DecisionConfig",
    "api.apps.APIConfig",
]


# -----------------------------------------------------------------------------
# Middleware
# -----------------------------------------------------------------------------

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]


# -----------------------------------------------------------------------------
# URL configuration
# -----------------------------------------------------------------------------

ROOT_URLCONF = "config.urls"


# -----------------------------------------------------------------------------
# Templates
# -----------------------------------------------------------------------------

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# -----------------------------------------------------------------------------
# WSGI / ASGI
# -----------------------------------------------------------------------------

WSGI_APPLICATION = "config.wsgi.application"

ASGI_APPLICATION = "config.asgi.application"


# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------
#
# SATARK does NOT use database-backed application logic in the MVP.
#
# This configuration exists only because Django expects a database backend
# configuration in its normal project setup.
#
# No SATARK subsystem should create models, ORM queries, migrations, or
# persistent application state.
# -----------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# -----------------------------------------------------------------------------
# Password validation
# -----------------------------------------------------------------------------
#
# SATARK does not currently implement user authentication.
# -----------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = []


# -----------------------------------------------------------------------------
# Internationalization
# -----------------------------------------------------------------------------

LANGUAGE_CODE = "en-us"

TIME_ZONE = "Asia/Kolkata"

USE_I18N = True

USE_TZ = True


# -----------------------------------------------------------------------------
# Static files
# -----------------------------------------------------------------------------

STATIC_URL = "static/"


# -----------------------------------------------------------------------------
# Default primary key field type
# -----------------------------------------------------------------------------

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# -----------------------------------------------------------------------------
# Django REST Framework
# -----------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
}

if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
else:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
    ]