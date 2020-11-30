import { Readable, Writable, Duplex } from 'stream'
import * as Pull from 'pull-stream'
import looper from '@jacobbubu/looper'

function isStdio(stream: any): boolean {
  return stream._isStdio
}

function destroy(stream: Readable | Writable) {
  if (!stream.destroy) {
    console.error(
      'warning, stream-to-pull-stream: \n'
      + 'the wrapped node-stream does not implement `destroy`, \n'
      + 'this may cause resource leaks.'
    )
    return
  }
  stream.destroy()
}

export function write<T>(
  source: Pull.Source<T>,
  writable: Writable,
  endCallback: (end: Pull.EndOrError) => void
): void {
  let ended: Pull.EndOrError = false

  let doneCalled: boolean = false
  function done() {
    if (doneCalled) { return }
    doneCalled = true
    if (endCallback) {
      endCallback(ended === true ? null : ended)
    }
  }

  let onCloseCalled: boolean = false
  function onClose() {
    if (onCloseCalled) { return }
    onCloseCalled = true
    cleanup()
    if (!ended) {
      ended = true
      source(true, done)
    } else { done() }
  }

  function onError(err: Error) {
    cleanup()
    if (!ended) {
      ended = err
      source(err, done)
    }
  }

  function cleanup() {
    writable.on('finish', onClose)
    writable.removeListener('close', onClose)
    writable.removeListener('error', onError)
  }

  writable.on('finish', onClose)
  writable.on('close', onClose)
  writable.on('error', onError)
  process.nextTick(function () {
    looper(function (next: () => void) {
      source(null, (end: Pull.EndOrError, data: T | undefined) => {
        ended = (ended || end)
        //you can't 'end' a stdout stream, so this needs to be handled specially.
        if (end === true)
          return isStdio(writable) ? done() : writable.end()

        if (ended = ended || end) {
          destroy(writable)
          return done()
        }

        //I noticed a problem streaming to the terminal:
        //sometimes the end got cut off, creating invalid output.
        //it seems that stdout always emits 'drain' when it ends.
        //so this seems to work, but i have been unable to reproduce this test
        //automatically, so you need to run ./test/stdout.js a few times and the end is valid json.
        if (isStdio(writable))
          writable.write(data, function () { next() })
        else {
          var pause = writable.write(data)
          if (pause === false)
            writable.once('drain', next)
          else next()
        }
      })
    })
  })
}

export function read2<T>(readable: Readable): Pull.Source<T> {
  let ended: Pull.EndOrError = false
  let waiting: boolean = false
  let cb: Pull.SourceCallback<T> | null

  function read() {
    let data = readable.read()
    if (data != null && cb) {
      let callback = cb
      cb = null
      callback(null, data)
    }
  }

  readable.on('readable', () => {
    waiting = true
    if (cb) {
      read()
    }
  })
  readable.on('end', () => {
    ended = true
    if (cb) {
      cb(ended)
    }
  })
  readable.on('error', (err: Error) => {
    ended = err
    if (cb) {
      cb(ended)
    }
  })

  return (abort: Pull.Abort, callback: Pull.SourceCallback<T>) => {
    cb = callback
    if (ended) {
      callback(ended)
    } else if (waiting) {
      read()
    }
  }
}

export function read1<T>(readable: Readable): Pull.Source<T> {
  let buffer: T[] = []
  let callbacks: Pull.SourceCallback<T>[] = []
  let ended: Pull.EndOrError = false
  let paused: boolean = false

  function drain() {
    while ((buffer.length > 0 || ended) && callbacks.length > 0) {
      let callback = callbacks.shift()
      if (callback) {
        callback(buffer.length > 0 ? null : ended, buffer.shift())
      }
    }
    if ((buffer.length == 0) && (paused)) {
      paused = false
      readable.resume()
    }
  }

  readable.on('data', (data: any) => {
    buffer.push(data)
    drain()
    if (buffer.length && readable.pause) {
      paused = true
      readable.pause()
    }
  })
  readable.on('end', () => {
    ended = true
    drain()
  })
  readable.on('close', () => {
    ended = true
    drain()
  })
  readable.on('error', (err: Error) => {
    ended = err
    drain()
  })

  return (abort: Pull.Abort, callback: Pull.SourceCallback<T>) => {
    if (!callback) {
      throw new Error('*must* provide callback')
    }

    function onAbort() {
      while (callbacks.length > 0) {
        let cb = callbacks.shift()
        if (cb) {
          cb(abort)
        }
      }
      callback(abort)
    }

    if (abort) {
      // if the stream happens to have already ended,
      // then we don't need to abort.
      if (ended) {
        return onAbort()
      }
      readable.once('close', onAbort)
      destroy(readable)
    } else {
      callbacks.push(callback)
      drain()
    }
  }
}

export function read<T>(readable: Readable): Pull.Source<T> {
  return read1<T>(readable)
}

export function sink<T>(
  writable: Writable,
  endCallback: (end: Pull.EndOrError) => void
): Pull.Sink<T> {
  return function (source: Pull.Source<T>) {
    write(source, writable, endCallback)
  }
}

export function source<T>(readable: Readable): Pull.Source<T> {
  return read1(readable)
}

export function duplex<In, Out>(
  duplex: Duplex,
  endCallback: (end: Pull.EndOrError) => void
): Pull.Duplex<In, Out> {
  return {
    source: source<In>(duplex),
    sink: sink<Out>(duplex, endCallback)
  }
}
