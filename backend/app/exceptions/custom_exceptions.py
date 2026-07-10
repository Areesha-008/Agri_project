class AppException(Exception):
    """Base exception for all application-specific errors."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class InvalidGeometryError(AppException):
    def __init__(self, message: str = "Invalid polygon geometry"):
        super().__init__(message, status_code=422)


class SatelliteDataError(AppException):
    def __init__(self, message: str = "Satellite data processing failed"):
        super().__init__(message, status_code=502)


class NoSatelliteImageFoundError(AppException):
    def __init__(self, message: str = "No cloud-free Sentinel-2 image found for this area/time range"):
        super().__init__(message, status_code=404)


class UserAlreadyExistsError(AppException):
    def __init__(self, message: str = "A user with this email already exists"):
        super().__init__(message, status_code=409)


class InvalidCredentialsError(AppException):
    def __init__(self, message: str = "Invalid email or password"):
        super().__init__(message, status_code=401)


class InvalidResetTokenError(AppException):
    def __init__(self, message: str = "This reset link is invalid or has expired"):
        super().__init__(message, status_code=400)


class FieldNotFoundError(AppException):
    def __init__(self, message: str = "Field not found"):
        super().__init__(message, status_code=404)


class JobNotFoundError(AppException):
    def __init__(self, message: str = "Job not found"):
        super().__init__(message, status_code=404)


class WeatherServiceError(AppException):
    def __init__(self, message: str = "Weather data temporarily unavailable"):
        super().__init__(message, status_code=502)


class AlertNotFoundError(AppException):
    def __init__(self, message: str = "Alert not found"):
        super().__init__(message, status_code=404)


class ScanNotFoundError(AppException):
    def __init__(self, message: str = "Scan not found"):
        super().__init__(message, status_code=404)


class InvalidImageError(AppException):
    def __init__(self, message: str = "Invalid image upload"):
        super().__init__(message, status_code=422)