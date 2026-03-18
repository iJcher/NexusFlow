export class JsonResponse<T = any> {
  errCode: number;
  errMsg: string;
  requestId?: string;
  data?: T;

  static ok<T>(data: T): JsonResponse<T> {
    return { errCode: 0, errMsg: '', data };
  }

  static error(errMsg: string, errCode = 1): JsonResponse {
    return { errCode, errMsg };
  }
}
