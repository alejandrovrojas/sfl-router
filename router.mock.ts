export function http_request(method: string, url: string, options: { headers?: Record<string, string>; body?: string; } = {}): Request {
	const headers = new Headers(options.headers || {});

	return new Request(url, {
		method,
		headers,
		body: options.body,
	});
}

export function test_handler(response_text: string) {
	return async () => {
		return new Response(response_text, { status: 200 });
	};
}

export function echo_handler() {
	return async (context: any) => {
		return new Response(
			JSON.stringify({
				params: context.params,
				search: context.search,
				cookies: context.cookies,
				url: context.request.url,
				method: context.request.method,
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	};
}
