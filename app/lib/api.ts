/**
 * Fetch wrapper that handles session expiry and redirects to login
 */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options);

  // If session expired, redirect to login
  if (response.status === 401) {
    // Store the current path so we can redirect back after login
    const currentPath = window.location.pathname;
    if (currentPath !== '/login') {
      sessionStorage.setItem('redirectAfterLogin', currentPath);
    }

    // Redirect to login page
    window.location.href = '/login?session=expired';

    // Throw to prevent further processing
    throw new Error('Session expired');
  }

  return response;
}
