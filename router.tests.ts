import { new_router, RouteContext, RouteHandler } from './router.ts';
import { TestSuite } from './router.suite.ts';
import { test_handler, echo_handler, http_request } from './router.mock.ts';

const tests = new TestSuite();

tests.run('registration: register get route', () => {
	const router = new_router();
	const handler = test_handler('test');

	router.get('/users', handler);
	tests.assert(router.state.trie.GET instanceof Map);
	const root = router.state.trie.GET?.get('/');
	tests.assert_not_null(root);
	const users_node = root?.nodes.get('users');
	tests.assert_not_null(users_node);
	tests.assert_equal(users_node?.handlers?.[0], handler);
});

tests.run('registration: register all http methods', () => {
	const router = new_router();
	const handler = test_handler('test');
	const path = '/test';

	router.get(path, handler);
	router.post(path, handler);
	router.put(path, handler);
	router.patch(path, handler);
	router.delete(path, handler);
	router.head(path, handler);
	router.connect(path, handler);
	router.options(path, handler);
	router.trace(path, handler);

	const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'CONNECT', 'OPTIONS', 'TRACE'];

	methods.forEach(method => {
		tests.assert(router.state.trie[method as keyof typeof router.state.trie] instanceof Map);
		const root = router.state.trie[method as keyof typeof router.state.trie]?.get('/');
		tests.assert_not_null(root);
		const test_node = root?.nodes.get('test');
		tests.assert_not_null(test_node);
		tests.assert_equal(test_node?.handlers?.[0], handler);
	});
});

tests.run('registration: register root path', () => {
	const router = new_router();
	const handler = test_handler('root');

	router.get('/', handler);

	const root = router.state.trie.GET?.get('/');
	tests.assert_not_null(root);

	tests.assert_equal(root?.handlers?.[0], handler);
});

tests.run('registration: register nested routes', () => {
	const router = new_router();
	const handler = test_handler('test');

	router.get('/users/profile/settings', handler);

	const root = router.state.trie.GET?.get('/');
	const users_node = root?.nodes.get('users');
	const profile_node = users_node?.nodes.get('profile');
	const settings_node = profile_node?.nodes.get('settings');

	tests.assert_equal(root?.handlers, undefined);
	tests.assert_equal(users_node?.handlers, undefined);
	tests.assert_equal(profile_node?.handlers, undefined);
	tests.assert_equal(settings_node?.handlers?.[0], handler);
});

tests.run('registration: register parameterized routes', () => {
	const router = new_router();
	const handler = test_handler('test');

	router.get('/users/:id', handler);

	const root = router.state.trie.GET?.get('/');
	const users_node = root?.nodes.get('users');
	const param_node = users_node?.nodes.get(':');
	tests.assert_equal(param_node?.name, 'id');
	tests.assert_equal(param_node?.handlers?.[0], handler);
});

tests.run('registration: register multiple parameters', () => {
	const router = new_router();
	const handler = test_handler('test');

	router.get('/users/:user_id/posts/:post_id', handler);

	const root = router.state.trie.GET?.get('/');
	const users_node = root?.nodes.get('users');
	const user_param_node = users_node?.nodes.get(':');
	const posts_node = user_param_node?.nodes.get('posts');
	const post_param_node = posts_node?.nodes.get(':');

	tests.assert_equal(user_param_node?.name, 'user_id');
	tests.assert_equal(post_param_node?.name, 'post_id');
	tests.assert_equal(post_param_node?.handlers?.[0], handler);
});

tests.run('registration: register wildcard routes', () => {
	const router = new_router();
	const handler = test_handler('test');

	router.get('/files/*', handler);

	const root = router.state.trie.GET?.get('/');
	const files_node = root?.nodes.get('files');
	const wildcard_node = files_node?.nodes.get('*');
	tests.assert_equal(wildcard_node?.handlers?.[0], handler);
});

tests.run('registration: overwrite routes', () => {
	const router = new_router();
	const handler1 = test_handler('first');
	const handler2 = test_handler('second');

	router.get('/users', handler1);
	router.get('/users', handler2);

	const root = router.state.trie.GET?.get('/');
	const users_node = root?.nodes.get('users');
	tests.assert_equal(users_node?.handlers?.[0], handler2);
});

tests.run('matching: match static routes', () => {
	const router = new_router();
	const handler = test_handler('users');

	router.get('/users', handler);

	const result = router.find('GET', '/users');
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers?.[0], handler);
	tests.assert_equal(result?.segment, 'users');
	tests.assert_object_equal(result?.params || {}, {});
});

tests.run('matching: match nested routes', () => {
	const router = new_router();
	const handler = test_handler('settings');

	router.get('/users/profile/settings', handler);

	const result = router.find('GET', '/users/profile/settings');
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers?.[0], handler);
	tests.assert_equal(result?.segment, 'settings');
});

tests.run('matching: partial route no handler', () => {
	const router = new_router();
	const handler = test_handler('settings');

	router.get('/users/profile/settings', handler);

	const result = router.find('GET', '/users/profile');
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers, undefined);
});

tests.run('matching: match root path', () => {
	const router = new_router();
	const handler = test_handler('root');

	router.get('/', handler);

	const result = router.find('GET', '/');
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers?.[0], handler);
});

tests.run('matching: match single parameter', () => {
	const router = new_router();
	const handler = test_handler('user');

	router.get('/users/:id', handler);

	const result = router.find('GET', '/users/123');
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers?.[0], handler);
	tests.assert_object_equal(result?.params || {}, { id: '123' });
	tests.assert_equal(result?.segment, '123');
});

tests.run('matching: match multiple parameters', () => {
	const router = new_router();
	const handler = test_handler('post');

	router.get('/users/:user_id/posts/:post_id', handler);

	const result = router.find('GET', '/users/456/posts/789');
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers?.[0], handler);
	tests.assert_object_equal(result?.params || {}, { user_id: '456', post_id: '789' });
});

tests.run('matching: match wildcard routes', () => {
	const router = new_router();
	const handler = test_handler('files');

	router.get('/api/*', handler);

	const result = router.find('GET', '/api/docs/readme.txt');
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers?.[0], handler);
	tests.assert_object_equal(result?.params || {}, {});
});

tests.run('matching: static precedence over params', () => {
	const router = new_router();
	const static_handler = test_handler('static');
	const param_handler = test_handler('param');

	router.get('/users/:id', param_handler);
	router.get('/users/new', static_handler);

	let result = router.find('GET', '/users/new');
	tests.assert_equal(result?.handlers?.[0], static_handler);

	result = router.find('GET', '/users/123');
	tests.assert_equal(result?.handlers?.[0], param_handler);
	tests.assert_object_equal(result?.params || {}, { id: '123' });
});

tests.run('matching: param precedence over wildcard', () => {
	const router = new_router();
	const param_handler = test_handler('param');
	const wildcard_handler = test_handler('wildcard');

	router.get('/api/*', wildcard_handler);
	router.get('/api/:version', param_handler);

	const result = router.find('GET', '/api/v1');
	tests.assert_equal(result?.handlers?.[0], param_handler);
	tests.assert_object_equal(result?.params || {}, { version: 'v1' });
});

tests.run('matching: precedence multi segment param limitation', () => {
	const router = new_router();
	const static_handler = test_handler('static');
	const param_handler = test_handler('param');
	const wildcard_handler = test_handler('wildcard');

	router.get('/api/*', wildcard_handler);
	router.get('/api/:version', param_handler);
	router.get('/api/docs', static_handler);

	let result = router.find('GET', '/api/docs');
	tests.assert_equal(result?.handlers?.[0], static_handler);

	result = router.find('GET', '/api/v1');
	tests.assert_equal(result?.handlers?.[0], param_handler);

	result = router.find('GET', '/api/some/deep/path');
	tests.assert_null(result);
});

tests.run('matching: no match returns null', () => {
	const router = new_router();
	const handler = test_handler('test');

	router.get('/users', handler);

	const result = router.find('GET', '/posts');
	tests.assert_null(result);
});

tests.run('matching: wrong method handled', () => {
	const router = new_router();
	const handler = test_handler('test');

	router.get('/users', handler);

	try {
		const result = router.find('POST', '/users');
		tests.assert_null(result);
	} catch (error) {
		tests.assert(true);
	}
});

tests.run('matching: incomplete param route', () => {
	const router = new_router();
	const handler = test_handler('test');

	router.get('/users/:id/posts', handler);

	const result = router.find('GET', '/users/123');
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers, undefined);
});

tests.run('request: basic get request', async () => {
	const router = new_router();
	const handler = test_handler('Hello World');

	router.get('/hello', handler);

	const request = http_request('GET', 'http://localhost:3000/hello');
	const response = await router.handle(request);

	tests.assert_equal(response.status, 200);
	const text = await response.text();
	tests.assert_equal(text, 'Hello World');
});

tests.run('request: extract url params', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/search', handler);

	const request = http_request('GET', 'http://localhost:3000/search?q=hello&page=1&sort=desc');
	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_object_equal(data.search, { q: 'hello', page: '1', sort: 'desc' });
});

tests.run('request: empty search params', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/search', handler);

	const request = http_request('GET', 'http://localhost:3000/search');
	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_object_equal(data.search, {});
});

tests.run('request: url encoded params', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/search', handler);

	const request = http_request('GET', 'http://localhost:3000/search?q=hello%20world&category=tech%26science');
	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_object_equal(data.search, { q: 'hello world', category: 'tech&science' });
});

tests.run('request: extract cookies', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/profile', handler);

	const request = http_request('GET', 'http://localhost:3000/profile', {
		headers: { cookie: 'session_id=abc123; user_id=456; theme=dark' },
	});
	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_object_equal(data.cookies, { session_id: 'abc123', user_id: '456', theme: 'dark' });
});

tests.run('request: missing cookies', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/profile', handler);

	const request = http_request('GET', 'http://localhost:3000/profile');
	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_object_equal(data.cookies, {});
});

tests.run('request: cookies with spaces', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/profile', handler);

	const request = http_request('GET', 'http://localhost:3000/profile', {
		headers: { cookie: 'session_id=abc123; user_id=456 ; theme= dark' },
	});

	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_object_equal(data.cookies, { session_id: 'abc123', user_id: '456', theme: ' dark' });
});

tests.run('request: extract route params', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/users/:id', handler);

	const request = http_request('GET', 'http://localhost:3000/users/123');
	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_object_equal(data.params, { id: '123' });
});

tests.run('request: multiple route params', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/users/:user_id/posts/:post_id', handler);

	const request = http_request('GET', 'http://localhost:3000/users/456/posts/789');
	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_object_equal(data.params, { user_id: '456', post_id: '789' });
});

tests.run('request: post request', async () => {
	const router = new_router();
	const handler = test_handler('POST received');

	router.post('/submit', handler);

	const request = http_request('POST', 'http://localhost:3000/submit');
	const response = await router.handle(request);

	tests.assert_equal(response.status, 200);
	const text = await response.text();
	tests.assert_equal(text, 'POST received');
});

tests.run('request: put request', async () => {
	const router = new_router();
	const handler = test_handler('PUT received');

	router.put('/update', handler);

	const request = http_request('PUT', 'http://localhost:3000/update');
	const response = await router.handle(request);

	tests.assert_equal(response.status, 200);
	const text = await response.text();
	tests.assert_equal(text, 'PUT received');
});

tests.run('request: delete request', async () => {
	const router = new_router();
	const handler = test_handler('DELETE received');

	router.delete('/remove', handler);

	const request = http_request('DELETE', 'http://localhost:3000/remove');
	const response = await router.handle(request);

	tests.assert_equal(response.status, 200);
	const text = await response.text();
	tests.assert_equal(text, 'DELETE received');
});

tests.run('request: unmatched route 404', async () => {
	const router = new_router();

	router.get('/dummy', test_handler('dummy'));

	const request = http_request('GET', 'http://localhost:3000/nonexistent');
	const response = await router.handle(request);

	tests.assert_equal(response.status, 404);
	const text = await response.text();
	tests.assert_equal(text, '404: Not found');
});

tests.run('request: custom fallback', async () => {
	const custom_fallback = async () => {
		return new Response('Custom 404', { status: 404 });
	};

	const router = new_router(custom_fallback);
	router.get('/dummy', test_handler('dummy'));

	const request = http_request('GET', 'http://localhost:3000/nonexistent');
	const response = await router.handle(request);

	tests.assert_equal(response.status, 404);
	const text = await response.text();
	tests.assert_equal(text, 'Custom 404');
});

tests.run('request: all context types', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/users/:id/profile', handler);

	const request = http_request('GET', 'http://localhost:3000/users/123/profile?tab=settings&view=full', {
		headers: { cookie: 'session_id=abc123; theme=dark' },
	});

	const response = await router.handle(request);
	const data = JSON.parse(await response.text());

	tests.assert_equal(data.url, 'http://localhost:3000/users/123/profile?tab=settings&view=full');
	tests.assert_equal(data.method, 'GET');
	tests.assert_object_equal(data.params, { id: '123' });
	tests.assert_object_equal(data.search, { tab: 'settings', view: 'full' });
	tests.assert_object_equal(data.cookies, { session_id: 'abc123', theme: 'dark' });
});

tests.run('edge: empty path registration', () => {
	const router = new_router();
	const handler = test_handler('empty');

	router.get('', handler);

	const result = router.find('GET', '');
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers?.[0], handler);
});

tests.run('edge: multiple slashes', () => {
	const router = new_router();
	const handler = test_handler('multi-slash');

	router.get('/users/profile', handler);

	const result = router.find('GET', '///users///profile///');
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers?.[0], handler);
});

tests.run('edge: root vs empty segments', () => {
	const router = new_router();
	const root_handler = test_handler('root');
	const empty_handler = test_handler('empty');

	router.get('/', root_handler);
	router.get('', empty_handler);



	let result = router.find('GET', '/');
	tests.assert_equal(result?.handlers?.[0], empty_handler);

	result = router.find('GET', '//');
	tests.assert_equal(result?.handlers?.[0], empty_handler);
});

tests.run('edge: param router override', () => {
	const router = new_router();
	const first_handler = test_handler('first');
	const other_handler = test_handler('other');

	router.get('/users/:first/profile', first_handler);
	router.get('/users/:other/profile', other_handler);

	const result = router.find('GET', '/users/test/profile');
	tests.assert_equal(result?.handlers?.[0], other_handler);
});

tests.run('edge: param with empty value', () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/users/profile', handler);

	const result = router.find('GET', '/users//profile');
	tests.assert_not_null(result); // Empty segments are skipped, so this matches /users/profile
});

tests.run('edge: special chars in params', () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/search/:query', handler);

	const special_chars = ['hello%20world', 'user@domain.com', 'data+more', 'key=value&other=data'];

	special_chars.forEach(test_value => {
		const result = router.find('GET', `/search/${test_value}`);
		tests.assert_not_null(result);
		tests.assert_object_equal(result?.params || {}, { query: test_value });
	});
});

tests.run('edge: very long params', () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/data/:value', handler);

	const long_value = 'a'.repeat(1000);
	const result = router.find('GET', `/data/${long_value}`);
	tests.assert_not_null(result);
	tests.assert_object_equal(result?.params || {}, { value: long_value });
});

tests.run('edge: wildcard at root', () => {
	const router = new_router();
	const handler = test_handler('root-wildcard');

	router.get('*', handler);

	const paths = ['/anything', '/deep/nested/path', '/single'];

	paths.forEach(path => {
		const result = router.find('GET', path);
		tests.assert_not_null(result);
		tests.assert_equal(result?.handlers?.[0], handler);
	});
});

tests.run('edge: unknown http method', async () => {
	const router = new_router();
	const handler = test_handler('test');

	router.get('/test', handler);

	try {
		const request = http_request('UNKNOWN', 'http://localhost/test');
		const response = await router.handle(request);
		tests.assert_equal(response.status, 404);
	} catch (error) {
		tests.assert(error instanceof Error);
	}
});

tests.run('performance: deeply nested routes', () => {
	const router = new_router();
	const handler = test_handler('deep');

	const segments = Array.from({ length: 20 }, (_, i) => `level${i}`);
	const path = '/' + segments.join('/');

	router.get(path, handler);

	const result = router.find('GET', path);
	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers?.[0], handler);
});

tests.run('performance: mixed deep nesting', () => {
	const router = new_router();
	const handler = test_handler('complex');

	const path = '/api/:v1/users/:user_id/data/:type/files/*';
	const test_path = '/api/v1/users/123/data/json/files/deep/nested/file.json';
	router.get(path, handler);

	const result = router.find('GET', test_path);

	tests.assert_not_null(result);
	tests.assert_equal(result?.handlers?.[0], handler);
	tests.assert_object_equal(result?.params || {}, { v1: 'v1', user_id: '123', type: 'json' });
});

tests.run('performance: rapid route registrations', () => {
	const router = new_router();

	const handlers: any[] = [];
	for (let i = 0; i < 1000; i++) {
		const handler = test_handler(`rapid-${i}`);
		handlers.push(handler);
		router.get(`/rapid/${i}`, handler);
	}

	const test_indices = [0, 100, 500, 999];
	test_indices.forEach(index => {
		const result = router.find('GET', `/rapid/${index}`);
		tests.assert_not_null(result);
		tests.assert_equal(result?.handlers?.[0], handlers[index]);
	});
});

tests.run('performance: extremely long query strings', async () => {
	const router = new_router();
	const handler = echo_handler();

	const paths = ['/test'];
	router.get(paths[0], handler);

	const long_value = 'x'.repeat(10000);
	const request = http_request('GET', `http://localhost/test?data=${long_value}`);
	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_equal(data.search.data, long_value);
});

tests.run('performance: many query params', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/test', handler);

	const params = Array.from({ length: 100 }, (_, i) => `param${i}=value${i}`);
	const query_string = params.join('&');

	const request = http_request('GET', `http://localhost/test?${query_string}`);
	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_equal(Object.keys(data.search).length, 100);
	tests.assert_equal(data.search.param0, 'value0');
	tests.assert_equal(data.search.param99, 'value99');
});

tests.run('performance: many cookies', async () => {
	const router = new_router();
	const handler = echo_handler();

	router.get('/test', handler);

	const cookies = Array.from({ length: 50 }, (_, i) => `cookie${i}=value${i}`);
	const cookie_string = cookies.join('; ');

	const request = http_request('GET', 'http://localhost/test', {
		headers: { cookie: cookie_string },
	});

	const response = await router.handle(request);

	const data = JSON.parse(await response.text());
	tests.assert_equal(Object.keys(data.cookies).length, 50);
	tests.assert_equal(data.cookies.cookie0, 'value0');
	tests.assert_equal(data.cookies.cookie49, 'value49');
});

tests.run('middleware: basic middleware chain', async () => {
	const router = new_router();

	const middleware = async (context: RouteContext, next?: RouteHandler) => {
		return next ? await next(context) : new Response('middleware');
	};

	const handler = async (context: RouteContext) => {
		return new Response('handler');
	};

	router.get('/test', middleware, handler);

	const request = http_request('GET', 'http://localhost/test');
	const response = await router.handle(request);
	const text = await response.text();

	tests.assert_equal(text, 'handler');
});

tests.run('middleware: middleware can return early', async () => {
	const router = new_router();

	const middleware = async (context: RouteContext, next?: RouteHandler) => {
		return new Response('middleware');
	};

	const handler = async (context: RouteContext) => {
		return new Response('handler');
	};

	router.get('/test', middleware, handler);

	const request = http_request('GET', 'http://localhost/test');
	const response = await router.handle(request);
	const text = await response.text();

	tests.assert_equal(text, 'middleware');
});

tests.print_results()
