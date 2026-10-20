import type {
  ApexaResponse,
  InterceptorId,
  InternalRequestConfig,
} from "../types.js";

interface InterceptorHandler<F, R> {
  readonly id: InterceptorId;
  readonly fulfilled?: F;
  readonly rejected?: R;
}

class InterceptorManager<F, R> {
  private handlers: Array<InterceptorHandler<F, R>> = [];
  private nextId = 0;

  public use(fulfilled?: F, rejected?: R): InterceptorId {
    const id = this.nextId++;
    this.handlers.push({
      id,
      ...(fulfilled !== undefined ? { fulfilled } : {}),
      ...(rejected !== undefined ? { rejected } : {}),
    });
    return id;
  }

  public eject(id: InterceptorId): void {
    this.handlers = this.handlers.filter((handler) => handler.id !== id);
  }

  public clear(): void {
    this.handlers = [];
  }

  public snapshot(): ReadonlyArray<InterceptorHandler<F, R>> {
    return [...this.handlers];
  }
}

export class InterceptorRegistry {
  public readonly request = new InterceptorManager<
    (
      config: InternalRequestConfig,
    ) => InternalRequestConfig | Promise<InternalRequestConfig>,
    (error: unknown) => unknown
  >();

  public readonly response = new InterceptorManager<
    (
      response: ApexaResponse<unknown>,
    ) => ApexaResponse<unknown> | Promise<ApexaResponse<unknown>>,
    (error: unknown) => unknown
  >();
}
