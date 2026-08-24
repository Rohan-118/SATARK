/**
 * API Client placeholder
 * This will eventually handle axios/fetch configuration and interceptors
 */

export const API_BASE_URL = 'http://localhost:8000/api';

class ApiError extends Error {
  public status: number;
  public data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    // Read the body exactly once as text to avoid "body stream already read"
    const bodyText = await response.text();
    let errorData: any;
    try {
      errorData = JSON.parse(bodyText);
    } catch {
      errorData = bodyText;
    }
    let errorMessage = `API Error ${response.status}: ${response.statusText}`;
    if (errorData) {
      if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (errorData.detail) {
        errorMessage = errorData.detail;
      } else if (Object.keys(errorData).length > 0) {
        errorMessage = JSON.stringify(errorData);
      }
    }
    
    throw new ApiError(
      response.status,
      errorMessage,
      errorData
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const apiClient = {
  get: async (url: string) => {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    return handleResponse(response);
  },
  post: async (url: string, data?: any) => {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse(response);
  }
};
