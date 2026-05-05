// sfl-router
// 0.1.0
//
// dependency-free http route delegation using a trie for segment-based path matching
// and parameter extraction. no regex compilation. routes are stored as a trie where
// each path segment becomes a node. traversal precedence is static > param > wildcard
// regardless of definition order. path matching is O(k) where k is the number of path
// segments. nodes stored in js maps for fast lookups.
//
//
// USAGE
//     const router = new_router();
//
//     // basic routes
//     router.get('/users', list_users);
//     router.post('/users', create_user);
//     router.put('/users', update_user);
//     router.del('/users', delete_user);
//
//     // parameters
//     router.get('/users/:user_id/posts/:post_id', get_post);
//
//     // middleware
//     router.get('/settings/', check_auth, get_settings);
//
//     // wildcards
//     router.get('/static/*', serve_static);
//
//     // custom fallback for unmatched routes
//     router.fallback(async () => {
//         return new Response('not found', { status: 404 });
//     });
//
//     // context
//     router.get('/api/v1/users/:id/posts/:slug', async (ctx: RouteContext) => {
//	       const { request, params, search, cookies } = ctx;
//         const { id, slug } = params;
//         return new Response(`${id}: ${slug}`);
//     });

type RouteMap  = Map<string, RouteNode>;
type RouteNode = {
	name:      string;
	handlers?: RouteHandler[];
	nodes:     RouteMap;
};

export type RoutePath    = string;
export type RouteMethod  = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'CONNECT' | 'OPTIONS' | 'TRACE';
export type RouteHandler = (context: RouteContext, next?: RouteHandler) => Promise<Response> | Response;
export type RouteParams  = Record<string, string>;
export type RouteCookies = Record<string, string>;
export type RouteSearch  = Record<string, string>;

export type RouterMatch = {
	readonly segment:  string;
	readonly handlers: RouteHandler[] | undefined;
	readonly params:   RouteParams;
};

export type RouteContext = {
	readonly url:     URL;
	readonly request: Request;
	readonly params:  RouteParams;
	readonly search:  RouteSearch;
	readonly cookies: RouteCookies;
};

export type Router = {
	trie:     Partial<Record<RouteMethod, RouteMap>>;
	fallback: RouteHandler;
};

const DEFAULT_FALLBACK: RouteHandler = () => {
	return new Response('404: Not found', { status: 404 });
};

export function new_router(fallback?: RouteHandler) {
	const state = init_router(fallback);

	return {
		state,
		get:     (path: RoutePath, ...handlers: RouteHandler[]) => get(state, path, ...handlers),
		post:    (path: RoutePath, ...handlers: RouteHandler[]) => post(state, path, ...handlers),
		put:     (path: RoutePath, ...handlers: RouteHandler[]) => put(state, path, ...handlers),
		patch:   (path: RoutePath, ...handlers: RouteHandler[]) => patch(state, path, ...handlers),
		delete:  (path: RoutePath, ...handlers: RouteHandler[]) => del(state, path, ...handlers),
		head:    (path: RoutePath, ...handlers: RouteHandler[]) => head(state, path, ...handlers),
		connect: (path: RoutePath, ...handlers: RouteHandler[]) => connect(state, path, ...handlers),
		options: (path: RoutePath, ...handlers: RouteHandler[]) => options(state, path, ...handlers),
		trace:   (path: RoutePath, ...handlers: RouteHandler[]) => trace(state, path, ...handlers),
		handle:  (request: Request) => handle_request(state, request),
		find:    (method: RouteMethod, path: string) => find_route(state, method, path),
	};
}

function init_router(fallback?: RouteHandler): Router {
	return {
		trie: {},
		fallback: fallback || DEFAULT_FALLBACK,
	};
}

function get(router: Router, path: RoutePath, ...handlers: RouteHandler[]): void {
	add_route(router, 'GET', path, ...handlers);
}

function post(router: Router, path: RoutePath, ...handlers: RouteHandler[]): void {
	add_route(router, 'POST', path, ...handlers);
}

function put(router: Router, path: RoutePath, ...handlers: RouteHandler[]): void {
	add_route(router, 'PUT', path, ...handlers);
}

function patch(router: Router, path: RoutePath, ...handlers: RouteHandler[]): void {
	add_route(router, 'PATCH', path, ...handlers);
}

function del(router: Router, path: RoutePath, ...handlers: RouteHandler[]): void {
	add_route(router, 'DELETE', path, ...handlers);
}

function head(router: Router, path: RoutePath, ...handlers: RouteHandler[]): void {
	add_route(router, 'HEAD', path, ...handlers);
}

function connect(router: Router, path: RoutePath, ...handlers: RouteHandler[]): void {
	add_route(router, 'CONNECT', path, ...handlers);
}

function options(router: Router, path: RoutePath, ...handlers: RouteHandler[]): void {
	add_route(router, 'OPTIONS', path, ...handlers);
}

function trace(router: Router, path: RoutePath, ...handlers: RouteHandler[]): void {
	add_route(router, 'TRACE', path, ...handlers);
}

function add_route(router: Router, method: RouteMethod, path: RoutePath, ...handlers: RouteHandler[]): void {
	const segments = parse_path_segments(path);

	if (!router.trie[method]) {
		router.trie[method] = new Map();
		router.trie[method]?.set('/', {
			name: '/',
			nodes: new Map(),
		});
	}

	let current_node = router.trie[method]?.get('/') as RouteNode;

	// handle root path directly
	if (segments.length === 0) {
		current_node.handlers = handlers;
		return;
	}

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		const segment_type  = segment[0] === ':' ? 'param' : segment[0] === '*' ? 'wildcard' : 'static';
		const segment_value = segment_type !== 'static' ? segment.slice(1) : segment;

		if (segment_type === 'static') {
			if (!current_node.nodes.has(segment_value)) {
				current_node.nodes.set(segment_value, {
					name: segment_value,
					nodes: new Map(),
				});
			}

			current_node = current_node.nodes.get(segment_value) as RouteNode;
		} else if (segment_type === 'param') {
			// all params stored under ':' key, name holds actual param name
			if (!current_node.nodes.has(':')) {
				current_node.nodes.set(':', {
					name: segment_value,
					nodes: new Map(),
				});
			}

			current_node = current_node.nodes.get(':') as RouteNode;

			if (segment_value !== current_node.name) {
				console.warn(`sfl-router: param ":${segment_value}" overrides ":${current_node.name}" in ${path}`);
			}
		} else if (segment_type === 'wildcard') {
			if (!current_node.nodes.has('*')) {
				current_node.nodes.set('*', {
					name: "*",
					nodes: new Map(),
				});
			}

			i = segments.length - 1;
			current_node = current_node.nodes.get('*') as RouteNode;
		}

		if (i === segments.length - 1) {
			current_node.handlers = handlers;
		}
	}
}

function find_route(router: Router, method: RouteMethod, path: string): RouterMatch | null {
	const segments = parse_path_segments(path);
	const root = router.trie[method]?.get('/');

	if (!root) {
		return null;
	}

	return traverse_tree(root, segments);
}

function handle_request(router: Router, request: Request): ReturnType<RouteHandler> {
	const url = new URL(request.url);
	const route = find_route(router, request.method as RouteMethod, url.pathname);

	const context: RouteContext = {
		url:     url,
		request: request,
		cookies: parse_cookies(request),
		search:  parse_search(url),
		params:  route ? route.params : {},
	};

	if (route && route.handlers && route.handlers.length > 0) {
		const route_handler = nest_handlers(route.handlers);
		return route_handler(context);
	}

	return router.fallback(context);
}

function traverse_tree(current_node: RouteNode, segments: string[], index: number = 0, params: RouteParams = {}): RouterMatch | null {
	if (index < segments.length) {
		const segment = segments[index];

		if (current_node.nodes.has(segment)) {
			const static_node = current_node.nodes.get(segment)!;
			return traverse_tree(static_node, segments, index + 1, params);
		}

		if (current_node.nodes.has(':')) {
			const param_node = current_node.nodes.get(':')!;
			const params_joined = Object.assign(params, {
				[param_node.name!]: segment,
			});

			return traverse_tree(param_node, segments, index + 1, params_joined);
		}

		if (current_node.nodes.has('*')) {
			const wildcard_node = current_node.nodes.get('*')!;
			return traverse_tree(wildcard_node, segments, segments.length, params);
		}

		return null;
	}

	return {
		segment: segments[index - 1] || '/',
		handlers: current_node.handlers,
		params: params,
	};
}

function nest_handlers(handlers: RouteHandler[]): RouteHandler {
	return handlers.reduceRight((next: RouteHandler, current: RouteHandler) => {
		return (context: RouteContext) => current(context, () => next(context));
	});
}

function parse_search(url: URL): RouteSearch {
	const params = new URLSearchParams(url.search);
	const result: Record<string, string> = {};

	for (const [key, value] of params.entries()) {
		result[key] = value;
	}

	return result;
}

function parse_cookies(request: Request): RouteCookies {
	const cookie_header = request.headers.get('cookie');

	if (!cookie_header) {
		return {};
	}

	const cookie_list = cookie_header.split(';');
	const result: Record<string, string> = {};

	for (const pair of cookie_list) {
		const [key, value] = pair.trim().split('=');
		result[key] = value;
	}

	return result;
}

function parse_path_segments(path: string): string[] {
	const segments: string[] = [];
	let start = 0;
	let i = 0;

	while (i < path.length) {
		if (path[i] === '/') {
			if (i > start) {
				segments.push(path.slice(start, i));
			}

			while (i < path.length && path[i] === '/') {
				i++;
			}

			start = i;
		} else {
			i++;
		}
	}

	if (i > start) {
		segments.push(path.slice(start, i));
	}

	return segments;
}
