using System.Collections.Concurrent;
using BakeryMarketplace.Eventing;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// The behaviour every broadcast backend must show (ADR-0021): at-most-once delivery to the subscribers connected at publish time,
/// no replay, isolated channels, ordered delivery, isolated handler failures, and no delivery after disposal.
/// A backend is tested by inheriting this class and supplying a publisher and subscriber that share one backend; a second pair on the
/// same backend stands for a second service instance.
/// </summary>
public abstract class BroadcastContractTests
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan Quiet = TimeSpan.FromMilliseconds(300);

    protected abstract (IBroadcastPublisher Publisher, IBroadcastSubscriber Subscriber) CreateInstance();

    /// <summary>A second instance connected to the same backend as the first.</summary>
    protected virtual (IBroadcastPublisher Publisher, IBroadcastSubscriber Subscriber) CreateOtherInstance() => CreateInstance();

    private static string NewChannel(string name) => $"test:{name}:{Guid.NewGuid():N}";

    private sealed class Inbox
    {
        private readonly ConcurrentQueue<string> _items = new();

        public Task Add(string m, CancellationToken _)
        {
            _items.Enqueue(m);
            return Task.CompletedTask;
        }

        public string[] Items => _items.ToArray();

        public async Task<string[]> WaitForAsync(int count)
        {
            var until = DateTime.UtcNow + Wait;
            while (_items.Count < count && DateTime.UtcNow < until) await Task.Delay(10);
            return Items;
        }
    }

    [Fact]
    public async Task A_subscriber_receives_a_message_published_after_it_subscribed()
    {
        var (pub, sub) = CreateInstance();
        var channel = NewChannel("one");
        var inbox = new Inbox();
        await using var s = await sub.SubscribeAsync(channel, inbox.Add);

        await pub.PublishAsync(channel, "hello");

        Assert.Equal(["hello"], await inbox.WaitForAsync(1));
    }

    [Fact]
    public async Task Every_subscriber_of_a_channel_receives_the_message()
    {
        var (pub, sub) = CreateInstance();
        var channel = NewChannel("many");
        Inbox a = new(), b = new();
        await using var sa = await sub.SubscribeAsync(channel, a.Add);
        await using var sb = await sub.SubscribeAsync(channel, b.Add);

        await pub.PublishAsync(channel, "x");

        Assert.Equal(["x"], await a.WaitForAsync(1));
        Assert.Equal(["x"], await b.WaitForAsync(1));
    }

    [Fact]
    public async Task A_subscriber_on_another_instance_receives_the_message()
    {
        var (pub, _) = CreateInstance();
        var (_, otherSub) = CreateOtherInstance();
        var channel = NewChannel("instances");
        var inbox = new Inbox();
        await using var s = await otherSub.SubscribeAsync(channel, inbox.Add);

        await pub.PublishAsync(channel, "across");

        Assert.Equal(["across"], await inbox.WaitForAsync(1));
    }

    [Fact]
    public async Task A_message_is_not_replayed_to_a_later_subscriber()
    {
        var (pub, sub) = CreateInstance();
        var channel = NewChannel("replay");
        await pub.PublishAsync(channel, "before");
        var inbox = new Inbox();
        await using var s = await sub.SubscribeAsync(channel, inbox.Add);

        await Task.Delay(Quiet);

        Assert.Empty(inbox.Items);
    }

    [Fact]
    public async Task A_message_does_not_reach_a_subscriber_of_another_channel()
    {
        var (pub, sub) = CreateInstance();
        var mine = NewChannel("mine");
        var theirs = NewChannel("theirs");
        var inbox = new Inbox();
        await using var s = await sub.SubscribeAsync(mine, inbox.Add);

        await pub.PublishAsync(theirs, "not for you");
        await Task.Delay(Quiet);

        Assert.Empty(inbox.Items);
    }

    [Fact]
    public async Task Channel_names_are_literal_not_patterns()
    {
        var (pub, sub) = CreateInstance();
        var prefix = NewChannel("pattern");
        var inbox = new Inbox();
        await using var s = await sub.SubscribeAsync(prefix + ":*", inbox.Add);

        await pub.PublishAsync(prefix + ":a", "x");
        await Task.Delay(Quiet);

        Assert.Empty(inbox.Items);
    }

    [Fact]
    public async Task Messages_from_one_publisher_arrive_in_order()
    {
        var (pub, sub) = CreateInstance();
        var channel = NewChannel("order");
        var inbox = new Inbox();
        await using var s = await sub.SubscribeAsync(channel, inbox.Add);

        var sent = Enumerable.Range(0, 50).Select(i => i.ToString(System.Globalization.CultureInfo.InvariantCulture)).ToArray();
        foreach (var m in sent) await pub.PublishAsync(channel, m);

        Assert.Equal(sent, await inbox.WaitForAsync(sent.Length));
    }

    [Fact]
    public async Task A_handler_handles_one_message_at_a_time()
    {
        var (pub, sub) = CreateInstance();
        var channel = NewChannel("serial");
        var running = 0;
        var overlapped = false;
        var done = 0;
        await using var s = await sub.SubscribeAsync(channel, async (_, ct) =>
        {
            if (Interlocked.Increment(ref running) > 1) overlapped = true;
            await Task.Delay(20, ct);
            Interlocked.Decrement(ref running);
            Interlocked.Increment(ref done);
        });

        for (var i = 0; i < 5; i++) await pub.PublishAsync(channel, i.ToString(System.Globalization.CultureInfo.InvariantCulture));
        var until = DateTime.UtcNow + Wait;
        while (Volatile.Read(ref done) < 5 && DateTime.UtcNow < until) await Task.Delay(10);

        Assert.Equal(5, done);
        Assert.False(overlapped);
    }

    [Fact]
    public async Task A_handler_that_throws_does_not_stop_its_own_later_messages_or_other_subscribers()
    {
        var (pub, sub) = CreateInstance();
        var channel = NewChannel("throws");
        var good = new Inbox();
        await using var bad = await sub.SubscribeAsync(channel, (m, _) => throw new InvalidOperationException("handler failed: " + m));
        await using var ok = await sub.SubscribeAsync(channel, good.Add);

        await pub.PublishAsync(channel, "1");
        await pub.PublishAsync(channel, "2");

        Assert.Equal(["1", "2"], await good.WaitForAsync(2));
    }

    [Fact]
    public async Task Publishing_with_no_subscriber_completes()
    {
        var (pub, _) = CreateInstance();

        await pub.PublishAsync(NewChannel("nobody"), "x");
    }

    [Fact]
    public async Task Nothing_is_delivered_after_the_subscription_is_disposed()
    {
        var (pub, sub) = CreateInstance();
        var channel = NewChannel("dispose");
        var inbox = new Inbox();
        var s = await sub.SubscribeAsync(channel, inbox.Add);
        await pub.PublishAsync(channel, "before");
        await inbox.WaitForAsync(1);

        await s.DisposeAsync();
        await pub.PublishAsync(channel, "after");
        await Task.Delay(Quiet);

        Assert.Equal(["before"], inbox.Items);
    }

    [Fact]
    public async Task Disposing_one_subscription_leaves_the_others_on_the_channel()
    {
        var (pub, sub) = CreateInstance();
        var channel = NewChannel("partial");
        Inbox a = new(), b = new();
        var sa = await sub.SubscribeAsync(channel, a.Add);
        await using var sb = await sub.SubscribeAsync(channel, b.Add);

        await sa.DisposeAsync();
        await pub.PublishAsync(channel, "x");

        Assert.Equal(["x"], await b.WaitForAsync(1));
        Assert.Empty(a.Items);
    }

    [Fact]
    public async Task Disposing_twice_is_harmless()
    {
        var (_, sub) = CreateInstance();
        var s = await sub.SubscribeAsync(NewChannel("twice"), new Inbox().Add);

        await s.DisposeAsync();
        await s.DisposeAsync();
    }

    [Fact]
    public async Task Messages_survive_unusual_text()
    {
        var (pub, sub) = CreateInstance();
        var channel = NewChannel("text");
        var inbox = new Inbox();
        await using var s = await sub.SubscribeAsync(channel, inbox.Add);
        var json = "{\"id\":\"é\\n\",\"emoji\":\"\U0001F950\",\"empty\":\"\"}";

        await pub.PublishAsync(channel, json);
        await pub.PublishAsync(channel, "");

        Assert.Equal([json, ""], await inbox.WaitForAsync(2));
    }
}
