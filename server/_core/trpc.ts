import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// SECURITY: Validate CSRF token on mutations
const validateCsrfToken = t.middleware(async opts => {
  const { ctx, next, type } = opts;

  // Only validate CSRF on mutations (not queries)
  if (type === "mutation" && ctx.fleetopsUser) {
    const getHeader = (name: string) =>
      typeof ctx.req.header === "function"
        ? ctx.req.header(name)
        : (
            ctx.req.headers as
              | Record<string, string | string[] | undefined>
              | undefined
          )?.[name];
    const authHeader = getHeader("authorization");
    const cookies =
      (ctx.req as { cookies?: Record<string, string> }).cookies ?? {};
    const cookieSession =
      cookies["sb-access-token"] || cookies["supabase-auth-token"];

    if (authHeader) return next();
    if (!cookieSession) return next();

    const csrfToken = getHeader("x-csrf-token");
    const origin = getHeader("origin");
    const referer = getHeader("referer");
    const requestOrigin =
      origin ?? (typeof referer === "string" ? new URL(referer).origin : null);
    const expectedOrigin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
    if (!csrfToken || typeof csrfToken !== "string" || csrfToken.length < 16) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "CSRF token is required for cookie-authenticated mutations",
      });
    }
    if (!requestOrigin || requestOrigin !== expectedOrigin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cross-site mutation rejected",
      });
    }
  }

  return next();
});

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireFleetOpsUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.fleetopsUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Supabase authentication required",
    });
  }
  return next({ ctx: { ...ctx, fleetopsUser: ctx.fleetopsUser } });
});

// SECURITY: Apply CSRF validation to FleetOps procedures
export const fleetOpsProcedure = t.procedure
  .use(requireFleetOpsUser)
  .use(validateCsrfToken);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);
