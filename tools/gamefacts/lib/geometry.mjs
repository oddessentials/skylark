const DEGREES = Math.PI / 180;

export function rotatorToQuaternion([pitch, yaw, roll]) {
  const halfPitch = (pitch * DEGREES) / 2;
  const halfYaw = (yaw * DEGREES) / 2;
  const halfRoll = (roll * DEGREES) / 2;
  const sp = Math.sin(halfPitch);
  const cp = Math.cos(halfPitch);
  const sy = Math.sin(halfYaw);
  const cy = Math.cos(halfYaw);
  const sr = Math.sin(halfRoll);
  const cr = Math.cos(halfRoll);
  return [
    cr * sp * sy - sr * cp * cy,
    -cr * sp * cy - sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy
  ];
}

export function multiplyQuaternions([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

export function rotateVector([qx, qy, qz, qw], [vx, vy, vz]) {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx)
  ];
}

export function composeTransforms(child, parent) {
  const scaled = [
    child.translation[0] * parent.scale[0],
    child.translation[1] * parent.scale[1],
    child.translation[2] * parent.scale[2]
  ];
  const rotated = rotateVector(parent.rotation, scaled);
  return {
    translation: [
      rotated[0] + parent.translation[0],
      rotated[1] + parent.translation[1],
      rotated[2] + parent.translation[2]
    ],
    rotation: multiplyQuaternions(parent.rotation, child.rotation),
    scale: [
      child.scale[0] * parent.scale[0],
      child.scale[1] * parent.scale[1],
      child.scale[2] * parent.scale[2]
    ]
  };
}

export function transformPoint(transform, point) {
  const scaled = [
    point[0] * transform.scale[0],
    point[1] * transform.scale[1],
    point[2] * transform.scale[2]
  ];
  const rotated = rotateVector(transform.rotation, scaled);
  return [
    rotated[0] + transform.translation[0],
    rotated[1] + transform.translation[1],
    rotated[2] + transform.translation[2]
  ];
}

export function boxCorners(transform, extent) {
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(transformPoint(transform, [sx * extent[0], sy * extent[1], sz * extent[2]]));
      }
    }
  }
  return corners;
}

export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = sorted.filter(
    (point, i) => i === 0 || point[0] !== sorted[i - 1][0] || point[1] !== sorted[i - 1][1]
  );
  if (unique.length < 3) return unique;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function polygonArea(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

export function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
