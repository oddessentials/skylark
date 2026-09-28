import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, message, status }) => {
  console.error('client error', status, error);
  return { message, code: `client_${status}` };
};
