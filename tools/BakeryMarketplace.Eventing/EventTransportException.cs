namespace BakeryMarketplace.Eventing;

/// <summary>
/// The event transport could not be reached or did not answer in time (broker down, connection lost, timeout). Raised by the event adapters
/// instead of their client library's own exceptions so callers can tell a failure that retrying may fix from one it cannot (a payload that does
/// not serialize, an unknown event type). The outbox keeps retrying these without limit and never parks on them (register item 182).
/// </summary>
public sealed class EventTransportException(string message, Exception? inner = null) : Exception(message, inner);
