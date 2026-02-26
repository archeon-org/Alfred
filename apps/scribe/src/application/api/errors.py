class ApiServiceError(Exception):
    def __init__(self, detail: str, status_code: int = 500) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
