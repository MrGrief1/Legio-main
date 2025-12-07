// API Configuration
// In development: uses VITE_API_BASE_URL (e.g., http://localhost:3001) 
// In production: uses empty string for relative URLs (proxied through nginx/backend)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Full URL for direct API calls (development) or relative for production
const getApiUrl = (path: string) => {
    if (API_BASE_URL) {
        return `${API_BASE_URL}${path}`;
    }
    return path;
};

export { API_URL, API_BASE_URL, getApiUrl };
