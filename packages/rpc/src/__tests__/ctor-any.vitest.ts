import { describe, it, expect } from 'vitest';
import { LoopbackPair, service, method, ctor, createProxyFromService, bindService } from '../index.js';
import { OptionKind } from '@dao-xyz/borsh';

class Foo {}
class Bar {}

@service({ dependencies: [Foo, Bar] })
class S {
  @method(ctor('any'), 'string')
  async getName(c: any): Promise<string> {
    return c?.name ?? 'none';
  }

  @method(new OptionKind(ctor('any')), 'string')
  async maybeName(c?: any): Promise<string> {
    return c ? c.name : 'none';
  }
}

describe('ctor("any") with explicit dependencies', () => {
  it('passes constructor across and resolves by name on server', async () => {
    const pair = new LoopbackPair();
    const unbind = bindService(S, pair.a, new S());
    const client = createProxyFromService(S, pair.b);

    await expect(client.getName(Foo)).resolves.toBe('Foo');
    await expect(client.getName(Bar)).resolves.toBe('Bar');
    await expect(client.maybeName()).resolves.toBe('none');
    await expect(client.maybeName(Foo)).resolves.toBe('Foo');

    unbind();
  });
});

describe('ctor("any") without dependencies fails to resolve', () => {
  @service()
  class S2 {
    @method(ctor('any'), 'string')
    async getName(c: any): Promise<string> {
      return c?.name ?? 'none';
    }
  }

  it('throws on unknown constructor name when no deps are provided', async () => {
    const pair = new LoopbackPair();
    const unbind = bindService(S2, pair.a, new S2());
    const client = createProxyFromService(S2, pair.b);

    await expect(client.getName(Foo)).rejects.toThrow(/CtorRef: unknown constructor/);

    unbind();
  });
});
