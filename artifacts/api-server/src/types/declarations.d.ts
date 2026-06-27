declare module "compression" {
  import { RequestHandler } from "express";
  interface CompressionOptions {
    filter?: (req: import("express").Request, res: import("express").Response) => boolean;
    threshold?: number;
    level?: number;
    chunkSize?: number;
    memLevel?: number;
    strategy?: number;
    windowBits?: number;
  }
  export default function compression(options?: CompressionOptions): RequestHandler;
}

declare module "node-cron" {
  interface ScheduledTask {
    start: () => void;
    stop: () => void;
    destroy: () => void;
  }
  export function schedule(
    expression: string,
    func: () => void,
    options?: { scheduled?: boolean; timezone?: string },
  ): ScheduledTask;
  export function validate(expression: string): boolean;
}
