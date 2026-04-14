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
//     const router = new Router();
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


// trie structure: method -> root node -> nested path segments
type RouteTrie = Partial<Record<RouteMethod, RouteMap>>;
type RouteMap  = Map<string, RouteNode>;
type RouteNode = {
	name:      string;           // segment name or param name for ':' nodes
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
	readonly segment: string;
	readonly handlers: RouteHandler[] | undefined,
	readonly params:  RouteParams
}

export type RouteContext = {
	readonly url:     URL;
	readonly request: Request;
	readonly params:  RouteParams;
	readonly search:  RouteSearch;
	readonly cookies: RouteCookies;
};

export class Router {
	public trie: RouteTrie = {};
	private handlers: Record<string, RouteHandler> = {
		fallback: () => {
			return new Response('404: Not found', {
				status: 404,
			});
		},
	};

	get(path: RoutePath, ...handlers: RouteHandler[]): void {
		this.add_node('GET', path, handlers);
	}

	post(path: RoutePath, ...handlers: RouteHandler[]): void {
		this.add_node('POST', path, handlers);
	}

	put(path: RoutePath, ...handlers: RouteHandler[]): void {
		this.add_node('PUT', path, handlers);
	}

	patch(path: RoutePath, ...handlers: RouteHandler[]): void {
		this.add_node('PATCH', path, handlers);
	}

	del(path: RoutePath, ...handlers: RouteHandler[]): void {
		this.add_node('DELETE', path, handlers);
	}

	head(path: RoutePath, ...handlers: RouteHandler[]): void {
		this.add_node('HEAD', path, handlers);
	}

	connect(path: RoutePath, ...handlers: RouteHandler[]): void {
		this.add_node('CONNECT', path, handlers);
	}

	options(path: RoutePath, ...handlers: RouteHandler[]): void {
		this.add_node('OPTIONS', path, handlers);
	}

	trace(path: RoutePath, ...handlers: RouteHandler[]): void {
		this.add_node('TRACE', path, handlers);
	}

	respond(status: number, message?: string, headers?: Record<string, string>): Response {
		return new Response(message, {
			status: status,
			headers: headers
		});
	}

	fallback(handler: RouteHandler): void {
		this.handlers.fallback = handler;
	}

	handler = (request: Request): ReturnType<RouteHandler> => {
		const url = new URL(request.url);
		const route = this.lookup(request.method as RouteMethod, url.pathname);

		function request_search() {
			const params = new URLSearchParams(url.search);
			const result: Record<string, string> = {};

			for (const [key, value] of params.entries()) {
				result[key] = value;
			}

			return result;
		};

		function request_cookies() {
			const cookie_header = request.headers.get('cookie');

			if (cookie_header) {
				const cookie_list = cookie_header.split(';');
				const result: Record<string, string> = {};

				for (const pair of cookie_list) {
					const [key, value] = pair.trim().split('=');
					result[key] = value;
				}

				return result;
			} else {
				return {};
			}
		};

		const context = {
			url:     url,
			request: request,
			cookies: request_cookies(),
			search:  request_search(),
			params:  route ? route.params : {},
		};

		if (route && route.handlers && route.handlers.length > 0) {
			const route_handler = this.nest_handlers(route.handlers);
			return route_handler(context);
		}

		return this.handlers.fallback(context);
	}

	private add_node(method: RouteMethod, path: RoutePath, handlers: RouteHandler[]): void {
		const segments = this.parse_path_segments(path);

		if (!this.trie[method]) {
			this.trie[method] = new Map();
			this.trie[method]?.set('/', {
				name: '/',
				nodes: new Map(),
			});
		}

		let current_node = this.trie[method]?.get('/') as RouteNode;

		// handle root path directly
		if (segments.length === 0) {
			current_node.handlers = handlers;
			return;
		}

		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			const segment_type  = segment[0] === ':' ? 'param' : segment[0] === '*' ? 'wildcard' : 'static';
			const segment_value = segment_type !== 'static' ? segment.slice(1) : segment;  // strip : or * prefix

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

				i = segments.length - 1;  // wildcard consumes remaining path
				current_node = current_node.nodes.get('*') as RouteNode;
			}

			if (i === segments.length - 1) {
				current_node.handlers = handlers;
			}
		}
	}

	private traverse_tree(current_node: RouteNode, segments: string[], index: number = 0, params: RouteParams = {}): RouterMatch | null {
		if (index < segments.length) {
			const segment = segments[index];

			// try exact match first
			if (current_node.nodes.has(segment)) {
				const static_node = current_node.nodes.get(segment)!;
				return this.traverse_tree(static_node, segments, index + 1, params);
			}

			// try param match, capture segment value
			if (current_node.nodes.has(':')) {
				const param_node = current_node.nodes.get(':')!;
				const params_joined = Object.assign(params, {
					[param_node.name!]: segment,
				});

				return this.traverse_tree(param_node, segments, index + 1, params_joined);
			}

			// try wildcard
			if (current_node.nodes.has('*')) {
				const wildcard_node = current_node.nodes.get('*')!;
				return this.traverse_tree(wildcard_node, segments, segments.length, params);
			}

			return null;
		}

		return {
			segment: segments[index - 1] || '/',
			handlers: current_node.handlers,
			params: params,
		};
	}

	private parse_path_segments(path: string): string[] {
		const segments: string[] = [];
		let start = 0;
		let i = 0;

		while (i < path.length) {
			if (path[i] === '/') {
				if (i > start) {
					segments.push(path.slice(start, i));
				}

				// skip multiple slashes!!
				while (i < path.length && path[i] === '/') {
					i++;
				}

				start = i;
			} else {
				i++;
			}
		}

		// add final segment if exists
		if (i > start) {
			segments.push(path.slice(start, i));
		}

		return segments;
	}

	private nest_handlers(handlers: RouteHandler[]): RouteHandler {
		return handlers.reduceRight((next: RouteHandler, current: RouteHandler) => {
			return (context: RouteContext) => current(context, () => next(context));
		});
	}

	private lookup(method: RouteMethod, path: string) : RouterMatch | null {
		const segments = this.parse_path_segments(path);
		const root = this.trie[method]?.get('/')!;
		return this.traverse_tree(root, segments);
	}
}

