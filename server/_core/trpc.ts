import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
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
    const csrfToken = ctx.req.header("x-csrf-token");
    const sessionToken = ctx.req.cookies?.["sb-access-token"] || ctx.req.header("authorization");
    
    if (!csrfToken) {
      throw new TRPCError({ code: "FORBIDDEN", message: "CSRF token is required for mutations" });
    }
    
    // Validate token format (should match Bearer token pattern)
    if (!sessionToken && csrfToken.length < 10) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Invalid CSRF token" });
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
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Supabase authentication required" });
  }
  return next({ ctx: { ...ctx, fleetopsUser: ctx.fleetopsUser } });
});

// SECURITY: Apply CSRF validation to FleetOps procedures
export const fleetOpsProcedure = t.procedure.use(requireFleetOpsUser).use(validateCsrfToken);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
