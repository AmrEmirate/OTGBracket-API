declare global {
  namespace Express {
    export interface Request {
      user?: {
        id: number;
        phone: string;
        role: string;
      };
    }
  }
}

// Ensure this is treated as a module
export {};
