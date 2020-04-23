const resolves = {}
const rejects = {}
let globalMsgId = 0

// Activate calculation in the worker, returning a promise
function sendMsg(payload, worker){
  const msgId = globalMsgId++
  const msg = {
    id: msgId,
    payload
  }
  return new Promise(function (resolve, reject) {
    // save callbacks for later
    resolves[msgId] = resolve
    rejects[msgId] = reject
    worker.postMessage(msg)
  })
}

function handleMsg(msg) {
  const {id, err, result} = JSON.parse(msg.data)
  if (result) {
    const resolve = resolves[id]
    if (resolve) {
      resolve(result)
    }
  } else {
    const reject = rejects[id]
    if (reject) {
        if (err) {
          reject(err)
        } else {
          reject('Got nothing')
        }
    }
  }

  delete resolves[id]
  delete rejects[id]
}

// WorkerWrapper class
class WorkerWrapper {
  constructor(jsPth) {
    this.worker = new Worker(jsPth)
    this.worker.onmessage = handleMsg
  }

  oche(str) {
    return sendMsg(str, this.worker)
  }
}
export default WorkerWrapper
