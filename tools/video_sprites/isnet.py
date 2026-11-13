import numpy as np, cv2, onnxruntime as ort
SESSION = None
def session(path):
    global SESSION
    if SESSION is None:
        SESSION = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    return SESSION

def alpha(bgr, model, box):
    """Soft cut-out of the main subject inside box=(x0,y0,x1,y1), returned for the whole frame."""
    x0, y0, x1, y1 = box
    crop = bgr[y0:y1, x0:x1]
    h, w = crop.shape[:2]
    s = 1024 / max(h, w)
    nw, nh = int(round(w * s)), int(round(h * s))
    rgb = cv2.cvtColor(cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB).astype(np.float32)
    canvas = np.zeros((1024, 1024, 3), np.float32)
    canvas[:nh, :nw] = rgb / max(rgb.max(), 1.0)
    canvas = (canvas - np.array([0.485, 0.456, 0.406], np.float32))
    out = session(model).run(None, {"input_image": canvas.transpose(2, 0, 1)[None]})[0][0, 0]
    out = (out - out.min()) / max(out.max() - out.min(), 1e-6)
    out = cv2.resize(out[:nh, :nw], (w, h), interpolation=cv2.INTER_LINEAR)
    full = np.zeros(bgr.shape[:2], np.float32)
    full[y0:y1, x0:x1] = out
    return full
