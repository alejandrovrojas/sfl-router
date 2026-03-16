sfl-router
0.1.0

dependency-free http route delegation using a trie for segment-based path matching
and parameter extraction. fast lookups, no regex compilation. routes are stored
as a trie where each path segment becomes a node. static segments match exactly,
parameters stored under ':' key, wildcards under '*' key. traversal follows
precedence: static > param > wildcard regardless of definition order. path matching
is O(k) where k is the number of path segments. no regex compilation or backtracking.
nodes stored in js Maps for fast lookups. memory usage scales with number of unique
segment combinations.

USAGE
    const router = new Router();

    //basic routes
    router.get('/users', list_users);
    router.post('/users', create_user);
    router.put('/users', update_user);
    router.del('/users', delete_user);

    //parameters
    router.get('/users/:user_id/posts/:post_id', get_post);

    //middleware
    router.get('/settings/', check_auth, get_settings);

    //wildcards
    router.get('/static/*', serve_static);

    //custom fallback for unmatched routes
    router.fallback(async () => {
        return new Response('not found', { status: 404 });
    });

    // context
    router.get('/api/v1/users/:id/posts/:slug', async (ctx: RouteContext) => {
        const { request, params, search, cookies } = ctx;
        const { id, slug } = params;
       return new Response(`${id}: ${slug}`);
   });
