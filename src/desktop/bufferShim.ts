// Minimal browser Buffer polyfill for xlsx/importParser/backup shims in direct standalone mode
export function ensureGlobalBuffer() {
  if (typeof (globalThis as Record<string, unknown>).Buffer !== 'undefined') return;

  class BrowserBuffer extends Uint8Array {
    override toString(encoding = 'utf8'): string {
      if (encoding === 'base64') {
        let bin = '';
        for (let i = 0; i < this.length; i++) bin += String.fromCharCode(this[i]);
        return btoa(bin);
      }
      if (encoding === 'ascii' || encoding === 'latin1' || encoding === 'binary') {
        let s = '';
        for (let i = 0; i < this.length; i++) s += String.fromCharCode(this[i]);
        return s;
      }
      return new TextDecoder(encoding === 'utf16le' ? 'utf-16le' : 'utf-8').decode(this);
    }

    override subarray(begin?: number, end?: number): BrowserBuffer {
      const view = super.subarray(begin, end);
      return new BrowserBuffer(view);
    }

    readUInt16LE(offset = 0): number {
      return this[offset] | (this[offset + 1] << 8);
    }

    readUInt32LE(offset = 0): number {
      return (this[offset] | (this[offset + 1] << 8) | (this[offset + 2] << 16) | (this[offset + 3] << 24)) >>> 0;
    }
  }

  const BufferGlobal = {
    isBuffer(obj: unknown): boolean {
      return obj instanceof Uint8Array;
    },
    from(input: string | ArrayLike<number> | ArrayBuffer, encoding?: string): BrowserBuffer {
      if (typeof input === 'string') {
        if (encoding === 'base64' || encoding === 'base64url') {
          let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4) b64 += '=';
          const bin = atob(b64);
          const out = new BrowserBuffer(bin.length);
          for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
          return out;
        }
        return new BrowserBuffer(new TextEncoder().encode(input));
      }
      if (input instanceof ArrayBuffer) {
        return new BrowserBuffer(new Uint8Array(input));
      }
      return new BrowserBuffer(input);
    },
    alloc(size: number): BrowserBuffer {
      return new BrowserBuffer(size);
    },
    concat(list: Uint8Array[]): BrowserBuffer {
      const total = list.reduce((s, b) => s + b.length, 0);
      const out = new BrowserBuffer(total);
      let off = 0;
      for (const b of list) {
        out.set(b, off);
        off += b.length;
      }
      return out;
    },
  };

  (globalThis as Record<string, unknown>).Buffer = BufferGlobal;
}
