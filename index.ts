export interface Env {
    DB: D1Database;
}

export default {
    async scheduled(
        _event: ScheduledEvent,
        _env: Env,
        _ctx: ExecutionContext,
    ): Promise<void> {},
    async fetch(
        _request: Request,
        _env: Env,
        _ctx: ExecutionContext,
    ): Promise<Response> {
        return new Response("ok", { status: 200 });
    },
};
