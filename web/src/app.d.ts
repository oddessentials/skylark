declare global {
  const __APP_VERSION__: string;

  namespace App {
    interface Error {
      message: string;
      code?: string;
    }
  }
}

export {};
