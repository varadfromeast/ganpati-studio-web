export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class ProviderSubmissionUnknownError extends Error {
  constructor(message = "The paid provider submission outcome is unknown.") {
    super(message);
    this.name = "ProviderSubmissionUnknownError";
  }
}

export class DailySpendLimitError extends Error {
  constructor(message = "The daily paid-generation limit has been reached.") {
    super(message);
    this.name = "DailySpendLimitError";
  }
}

export class ProcessingLeaseLostError extends Error {
  constructor() {
    super("The processing lease expired or belongs to another worker.");
    this.name = "ProcessingLeaseLostError";
  }
}
