import { Readable, Writable, Stream } from "stream"
import { Socket } from "net"
import { Source, Sink, Through, Duplex } from "pull-stream"

function noop() { }

export function ToPull(socket: Socket): Duplex<Buffer, Buffer> {
  let duplex: Duplex<Buffer, Buffer> = {
    source: noop,
    sink: noop
  }
  return duplex
}
