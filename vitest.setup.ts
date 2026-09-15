if (!process.env.VITE_SUPABASE_URL && process.env.SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL;
}

if (!process.env.VITE_SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY) {
  process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
}

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  process.env.SUPABASE_ACCESS_TOKEN = "sbp_test_placeholder";
}

if (!process.env.RESEND_API_KEY) {
  process.env.RESEND_API_KEY = "re_placeholder";
}

if (!process.env.RAZORPAY_TEST_KEY_ID) {
  process.env.RAZORPAY_TEST_KEY_ID = "rzp_test_placeholder";
}

if (!process.env.RAZORPAY_TEST_KEY_SECRET) {
  process.env.RAZORPAY_TEST_KEY_SECRET = "placeholder";
}

if (typeof globalThis.WebSocket === "undefined") {
  class TestWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = TestWebSocket.OPEN;

    addEventListener() {}
    removeEventListener() {}
    close() {}
    send() {}
  }

  globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket;
}

const originalFetch = globalThis.fetch?.bind(globalThis);

globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (url === "https://api.supabase.com/v1/projects") {
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (url === "https://api.resend.com/domains") {
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (url === "https://api.razorpay.com/v1/payments?count=1") {
    return new Response(JSON.stringify({ entity: "collection", count: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (!originalFetch) throw new Error("fetch is unavailable");
  return originalFetch(input, init);
};
