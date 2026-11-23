import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';

function makeContext(role?: string): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (deny by default)', () => {
  it('denies access when no @Roles metadata is present', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(makeContext('SUPERADMIN'))).toThrow(ForbiddenException);
  });

  it('allows matching role and denies non-matching role', () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => {
        if (key === 'auth:roles') return ['SUPERADMIN', 'ADMIN'];
        return false;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(makeContext('ADMIN'))).toBe(true);
    expect(() => guard.canActivate(makeContext('GUARD'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(makeContext('ACCOUNTANT'))).toThrow(ForbiddenException);
  });
});
