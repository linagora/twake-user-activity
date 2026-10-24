/** An event that can never be processed: logged and dropped. */
export class MalformedEventError extends Error {
  override name = 'MalformedEventError'
}

/** A well-formed event the product refuses for good: dead lettered. */
export class RejectedEventError extends Error {
  override name = 'RejectedEventError'
}
