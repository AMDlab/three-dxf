import * as THREE from 'three'
import { OrbitControls } from 'three-dxf/dist/OrbitControls';

import { create, all } from 'mathjs'
const math = create(all, {})
const THREEx = require('three-dxf/dist/THREEx')

import Parallel from 'paralleljs'

/**
 * DEFAULT OPTION for Viewer fucntion
 */
const DEFAULT_OPT = { width: null, height: null, font: null, pan: true, rotate: true, zoom: true }

/**
 * Viewer class for a dxf object.
 * @param {Object} data - the dxf object
 * @param {Object} parent - the parent element to which we attach the rendering canvas
 * @param {Object} opt - options for three.js
 * @param {Object} cEvents - additional events for three.js viewer
 * @constructor
 */

export function Viewer(data, parent, opt = DEFAULT_OPT, cEvents = {}) {
  data = createLineTypeShaders(data)
  const scene = new THREE.Scene()
  const width = opt['width'] || parent.clientWidth
  const height = opt['height'] || parent.clientHeight
  const font = opt['font']
  const aspectRatio = width / height

  // Create scene from dxf object (data)
  const result = createObjects(data, font)
  const objs = result.objs

  // Create Intersct Point
  const intersects = createIntersectPoint(result.lineVecs)

  // Add Object to scene
  for(const obj of objs) {
    scene.add(obj)
  }

  // get drawing scope
  const dims = createViewScope(objs)
  const upperRightCorner = { x: dims.max.x, y: dims.max.y }
  const lowerLeftCorner = { x: dims.min.x, y: dims.min.y }

  // Figure out the current viewport extents
  let vp_width = upperRightCorner.x - lowerLeftCorner.x
  let vp_height = upperRightCorner.y - lowerLeftCorner.y
  const center = {
    x: vp_width / 2 + lowerLeftCorner.x,
    y: vp_height / 2 + lowerLeftCorner.y
  }

  // Fit all objects into current ThreeDXF viewer
  const extentsAspectRatio = Math.abs(vp_width / vp_height)
  if (aspectRatio > extentsAspectRatio) {
    vp_width = vp_height * aspectRatio
  } else {
    vp_height = vp_width / aspectRatio
  }

  const viewPort = {
    bottom: -vp_height / 2,
    left: -vp_width / 2,
    top: vp_height / 2,
    right: vp_width / 2,
    center: {
      x: center.x,
      y: center.y
    }
  }

  // var viewPort = Helpers.getCameraParametersFromScene(aspectRatio, scene)
  const camera = new THREE.OrthographicCamera(
    viewPort.left,
    viewPort.right,
    viewPort.top,
    viewPort.bottom,
    1,
    1000
  )
  camera.position.z = 10
  camera.position.x = viewPort.center.x
  camera.position.y = viewPort.center.y

  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(width, height)
  renderer.setClearColor(0xfffffff, 1)

  parent.append(renderer.domElement)
  parent.style.display = 'block'

  var controls = new OrbitControls(camera, parent)
  controls.enablePan = opt['pan'] == null ? true : opt['pan']
  controls.screenSpacePanning = opt['pan'] == null ? true : opt['pan']
  controls.enableZoom = opt['zoom'] == null ? true : opt['zoom']
  controls.enableRotate = opt['rotate'] == null ? true : opt['rotate']
  controls.target.x = camera.position.x
  controls.target.y = camera.position.y
  controls.target.z = 0
  controls.zoomSpeed = 3

  //Uncomment this to disable rotation (does not make much sense with 2D drawings).
  //controls.enableRotate = false;

  this.render = function() {
    renderer.render(scene, camera)
  }

  controls.addEventListener('change', this.render)

  for (let k in cEvents) {
    parent.addEventListener(k, cEvents[k])
  }

  this.render()
  controls.update()

  const raycaster = new THREE.Raycaster()

  this.resize = function(width, height) {
    const originalWidth = renderer.domElement.width
    const originalHeight = renderer.domElement.height

    const hscale = width / originalWidth
    const vscale = height / originalHeight

    camera.top = vscale * camera.top
    camera.bottom = vscale * camera.bottom
    camera.left = hscale * camera.left
    camera.right = hscale * camera.right

    // camera.updateProjectionMatrix();

    renderer.setSize(width, height)
    renderer.setClearColor(0xfffffff, 1)
    this.render()
  }

  return {
    canvas: parent,
    raycaster: raycaster,
    scene: scene,
    renderer: renderer,
    camera: camera,
    controls: controls,
    objs: objs,
    intersects: intersects,
    three: THREE
  }
}

/**
 * @param {Object} entities
 * @return Array
 */
function createObjects(data, font) {
  const objs = []
  let lineVecs = []
  const p = new Parallel(data.entities, {
    env: {
      data: data,
      font: font
    }
  })
  p.require(drawEntity)
  console.log(p);
  p.map((entity)=> {
    return drawEntity(entity, global.env.data, global.env.font)
  }).then((result) => {
    const obj = result.mesh
    if (obj) {
      objs.push(obj)
      lineVecs = lineVecs.concat(result.lineVecs)
    }
  })

  // for (let i = 0; i < data.entities.length; i++) {
  //   const result = drawEntity(data.entities[i], data, font)
  //   const obj = result.mesh

  //   if (!obj) continue;

  //   objs.push(obj)
  //   lineVecs = lineVecs.concat(result.lineVecs)
  // }
  return { objs: objs, lineVecs: lineVecs }
}

/**
 * @param {Object} objs
 * @return Array
 */
function createViewScope(objs) {
  var dims = {
    min: { x: false, y: false, z: false },
    max: { x: false, y: false, z: false }
  }

  for (const obj of objs) {
    var bbox = new THREE.Box3().setFromObject(obj)
    if (bbox.min.x && (dims.min.x === false || dims.min.x > bbox.min.x))
      dims.min.x = bbox.min.x
    if (bbox.min.y && (dims.min.y === false || dims.min.y > bbox.min.y))
      dims.min.y = bbox.min.y
    if (bbox.min.z && (dims.min.z === false || dims.min.z > bbox.min.z))
      dims.min.z = bbox.min.z
    if (bbox.max.x && (dims.max.x === false || dims.max.x < bbox.max.x))
      dims.max.x = bbox.max.x
    if (bbox.max.y && (dims.max.y === false || dims.max.y < bbox.max.y))
      dims.max.y = bbox.max.y
    if (bbox.max.z && (dims.max.z === false || dims.max.z < bbox.max.z))
      dims.max.z = bbox.max.z
  }
  return dims
}

/**
 * @param {Object} lineVecs
 * @return Array
 */
function createIntersectPoint(lineVecs) {
  const finieshLine = []
  let intersects = []
  for(const line of lineVecs) {
    intersects = intersects.concat(findCrossPoint(line.start, line.end, finieshLine))
    finieshLine.push(line)
  }
  return intersects
}

/**
 * @param {Array} formula [Array<Array<Float> >] 係数行列A: num x num 行列
 * @param {Array} results [Array<Float>] 右辺のベクトルb: num x 1 行列
 * @return Array
 */
function solveSimultaneousEquation(formula, results) {
  return math.lusolve(math.matrix(formula), math.matrix(results))._data
}

/**
 * @param {Object} point1 { x: xxx, y: yyy, z: zzz }
 * @param {Object} point2 { x: xxx, y: yyy, z: zzz }
 * @return array
 */
function getCoefficienConst(point1, point2) {
  if (point1.x == point2.x && point1.y == point2.y) {
    return [null, null]
  } else if (point1.x == point2.x) {
    return [point1.x, null]
  } else if (point1.y == point2.y) {
    return [null, point1.y]
  }

  var result = solveSimultaneousEquation(
    [
      [point1.x, 1],
      [point2.x, 1]
    ],
    [point1.y, point2.y]
  )
  return [result[0][0], result[1][0]]
}

/**
 * @param {Object} point1 { x: xxx, y: yyy, z: zzz }
 * @param {Object} point2 { x: xxx, y: yyy, z: zzz }
 * @return array
 */
function findCrossPoint(point1, point2, finieshLine) {
  const intersects = []
  var minxo = math.min(point1.x, point2.x)
  var minyo = math.min(point1.y, point2.y)
  var maxxo = math.max(point1.x, point2.x)
  var maxyo = math.max(point1.y, point2.y)

  var originCoefficienConst = getCoefficienConst(point1, point2)
  var ao = originCoefficienConst[0]
  var ko = originCoefficienConst[1]
  for (var c = 0; c < finieshLine.length; c++) {
    var minxt = math.min(finieshLine[c].start.x, finieshLine[c].end.x)
    var minyt = math.min(finieshLine[c].start.y, finieshLine[c].end.y)
    var maxxt = math.max(finieshLine[c].start.x, finieshLine[c].end.x)
    var maxyt = math.max(finieshLine[c].start.y, finieshLine[c].end.y)
    if (maxxt < minxo || maxxo < minxt || maxyt < minyo || maxyo < minyt) {
      continue
    }
    var targetCoefficienConst = getCoefficienConst(
      finieshLine[c].start,
      finieshLine[c].end
    )
    var at = targetCoefficienConst[0]
    var kt = targetCoefficienConst[1]
    var intersectX, intersectY
    if (at == null && kt == null) {
      continue
    } else if (ao == null && ko == null) {
      continue
    } else if (ko == null && kt == null) {
      continue
    } else if (ao == null && at == null) {
      continue
    } else if (ko == null && at == null) {
      intersectX = ao
      intersectY = kt
    } else if (ao == null && kt == null) {
      intersectX = at
      intersectY = ko
    } else if (ko == null) {
      intersectX = ao
      intersectY = at * ao + kt
    } else if (ao == null) {
      intersectY = ko
      intersectX = (ko - kt) / at
    } else if (kt == null) {
      intersectX = at
      intersectY = ao * at + ko
    } else if (at == null) {
      intersectY = kt
      intersectX = (kt - ko) / ao
    } else {
      try {
        var result = solveSimultaneousEquation(
          [
            [1, -1 * ao],
            [1, -1 * at]
          ],
          [ko, kt]
        )
        intersectX = result[1][0]
        intersectY = result[0][0]
      } catch (ex) {
        console.log(ex)
      }
    }
    if (
      math.max(minxo, minxt) <= intersectX &&
      intersectX <= math.min(maxxo, maxxt) &&
      math.max(minyo, minyt) <= intersectY &&
      intersectY <= math.min(maxyo, maxyt) &&
      !(intersectX == point1.x && intersectY == point1.y) &&
      !(intersectX == point2.x && intersectY == point2.y)
    ) {
      var geometry, material, point
      geometry = new THREE.Geometry()
      geometry.vertices.push(new THREE.Vector3(intersectX, intersectY, 0))
      material = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: THREE.VertexColors
      })
      point = new THREE.Points(geometry, material)
      intersects.push(point)
    }
  }
  return intersects
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 * @return mesh
 */
function drawEntity(entity, data, font) {
  let mesh
  let lineVecs = []
  if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
    mesh = drawArc(entity, data)
  } else if (
    entity.type === 'LWPOLYLINE' ||
    entity.type === 'LINE' ||
    entity.type === 'POLYLINE'
  ) {
    const result = drawLine(entity, data)
    mesh = result.lines
    lineVecs = result.lineVecs
  } else if (entity.type === 'TEXT') {
    mesh = drawText(entity, data, font)
  } else if (entity.type === 'SOLID') {
    mesh = drawSolid(entity, data)
  } else if (entity.type === 'POINT') {
    mesh = drawPoint(entity, data)
  } else if (entity.type === 'INSERT') {
    const result = drawBlock(entity, data, font)
    mesh = result.group
    lineVecs = result.lineVecs
  } else if (entity.type === 'SPLINE') {
    mesh = drawSpline(entity, data)
  } else if (entity.type === 'MTEXT') {
    mesh = drawMtext(entity, data, font)
  } else if (entity.type === 'ELLIPSE') {
    mesh = drawEllipse(entity, data)
  } else if (entity.type === 'DIMENSION') {
    var dimTypeEnum = entity.dimensionType & 7
    if (dimTypeEnum === 0) {
      const result = drawDimension(entity, data, font)
      mesh = result.group
      lineVecs = result.lineVecs
    } else {
      console.log('Unsupported Dimension type: ' + dimTypeEnum)
    }
  } else {
    console.log('Unsupported Entity Type: ' + entity.type)
  }
  return { mesh: mesh, lineVecs: lineVecs }
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function drawEllipse(entity, data) {
  var color = getColor(entity, data)

  var xrad = Math.sqrt(
    Math.pow(entity.majorAxisEndPoint.x, 2) +
      Math.pow(entity.majorAxisEndPoint.y, 2)
  )
  var yrad = xrad * entity.axisRatio
  var rotation = Math.atan2(
    entity.majorAxisEndPoint.y,
    entity.majorAxisEndPoint.x
  )

  var curve = new THREE.EllipseCurve(
    entity.center.x,
    entity.center.y,
    xrad,
    yrad,
    entity.startAngle,
    entity.endAngle,
    false, // Always counterclockwise
    rotation
  )

  var points = curve.getPoints(50)
  var geometry = new THREE.BufferGeometry().setFromPoints(points)
  var material = new THREE.LineBasicMaterial({ linewidth: 1, color: color })

  // Create the final object to add to the scene
  var ellipse = new THREE.Line(geometry, material)
  return ellipse
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function drawMtext(entity, data, font) {
  try {
    var color = getColor(entity, data)
    var geometry = new THREE.TextBufferGeometry(entity.text, {
      font: font,
      size: entity.height * (4 / 5),
      height: 10
    })

    var material = new THREE.MeshBasicMaterial({ color: color })
    var text = new THREE.Mesh(geometry, material)

    // Measure what we rendered.
    var measure = new THREE.Box3()
    measure.setFromObject(text)

    var textWidth = measure.max.x - measure.min.x
    // If the text ends up being wider than the box, it's supposed
    // to be multiline. Doing that in threeJS is overkill.
    if (textWidth > entity.width) {
      console.log('Can\'t render this multipline MTEXT entity, sorry.', entity)
      return undefined
    }

    text.position.z = 0
    switch (entity.attachmentPoint) {
      case 1:
        // Top Left
        text.position.x = entity.position.x
        text.position.y = entity.position.y - entity.height
        break
      case 2:
        // Top Center
        text.position.x = entity.position.x - textWidth / 2
        text.position.y = entity.position.y - entity.height
        break
      case 3:
        // Top Right
        text.position.x = entity.position.x - textWidth
        text.position.y = entity.position.y - entity.height
        break

      case 4:
        // Middle Left
        text.position.x = entity.position.x
        text.position.y = entity.position.y - entity.height / 2
        break
      case 5:
        // Middle Center
        text.position.x = entity.position.x - textWidth / 2
        text.position.y = entity.position.y - entity.height / 2
        break
      case 6:
        // Middle Right
        text.position.x = entity.position.x - textWidth
        text.position.y = entity.position.y - entity.height / 2
        break

      case 7:
        // Bottom Left
        text.position.x = entity.position.x
        text.position.y = entity.position.y
        break
      case 8:
        // Bottom Center
        text.position.x = entity.position.x - textWidth / 2
        text.position.y = entity.position.y
        break
      case 9:
        // Bottom Right
        text.position.x = entity.position.x - textWidth
        text.position.y = entity.position.y
        break

      default:
        return undefined
    }
  } catch (ex) {
    console.log(ex);
    return null
  }

  return text
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function drawSpline(entity, data) {
  var color = getColor(entity, data)

  var points = entity.controlPoints.map(function(vec) {
    return new THREE.Vector2(vec.x, vec.y)
  })

  var interpolatedPoints = []
  var curve
  if (entity.degreeOfSplineCurve === 2 || entity.degreeOfSplineCurve === 3) {
    for (var i = 0; i + 2 < points.length; i = i + 2) {
      if (entity.degreeOfSplineCurve === 2) {
        curve = new THREE.QuadraticBezierCurve(
          points[i],
          points[i + 1],
          points[i + 2]
        )
      } else {
        curve = new THREE.QuadraticBezierCurve3(
          points[i],
          points[i + 1],
          points[i + 2]
        )
      }
      interpolatedPoints.push.apply(interpolatedPoints, curve.getPoints(50))
    }
  } else {
    curve = new THREE.SplineCurve(points)
    interpolatedPoints = curve.getPoints(100)
  }

  var geometry = new THREE.BufferGeometry().setFromPoints(interpolatedPoints)
  var material = new THREE.LineBasicMaterial({ linewidth: 1, color: color })
  var splineObject = new THREE.Line(geometry, material)

  return splineObject
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function drawLine(entity, data) {
  const lineVecs = []
  const geometry = new THREE.Geometry()
  const color = getColor(entity, data)
  let material
  let lineType

  // create geometry
  for (let i = 0; i < entity.vertices.length; i++) {
    if (entity.vertices[i].bulge) {
      const bulge = entity.vertices[i].bulge
      const startPoint = entity.vertices[i]
      const endPoint =
        i + 1 < entity.vertices.length
          ? entity.vertices[i + 1]
          : geometry.vertices[0]
      const bulgeGeometry = new THREEx.BulgeGeometry(startPoint, endPoint, bulge)
      geometry.vertices.push.apply(geometry.vertices, bulgeGeometry.vertices)
    } else {
      const vertex = entity.vertices[i]
      geometry.vertices.push(new THREE.Vector3(vertex.x, vertex.y, 0))
    }
  }

  if (entity.shape) geometry.vertices.push(geometry.vertices[0])

  // create intersectPoints
  for (let i = 1; i < geometry.vertices.length; i++) {
    lineVecs.push({
      start: geometry.vertices[i - 1],
      end: geometry.vertices[i]
    })
  }

  // set material
  if (entity.lineType && data.tables) {
    lineType = data.tables.lineType.lineTypes[entity.lineType]
  }

  if (lineType && lineType.pattern && lineType.pattern.length !== 0) {
    material = new THREE.LineDashedMaterial({
      color: color,
      gapSize: 4,
      dashSize: 4
    })
  } else {
    material = new THREE.LineBasicMaterial({
      linewidth: 1,
      color: color
    })
  }
  return { lines: new THREE.Line(geometry, material), lineVecs: lineVecs }
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function drawArc(entity, data) {
  var startAngle, endAngle
  if (entity.type === 'CIRCLE') {
    startAngle = entity.startAngle || 0
    endAngle = startAngle + 2 * Math.PI
  } else {
    startAngle = entity.startAngle
    endAngle = entity.endAngle
  }

  var curve = new THREE.ArcCurve(0, 0, entity.radius, startAngle, endAngle)

  var points = curve.getPoints(32)
  var geometry = new THREE.BufferGeometry().setFromPoints(points)

  var material = new THREE.LineBasicMaterial({
    color: getColor(entity, data)
  })

  var arc = new THREE.Line(geometry, material)
  arc.position.x = entity.center.x
  arc.position.y = entity.center.y
  arc.position.z = entity.center.z

  return arc
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function drawSolid(entity, data) {
  var material,
    mesh,
    verts,
    geometry = new THREE.Geometry()

  verts = geometry.vertices
  verts.push(
    new THREE.Vector3(
      entity.points[0].x,
      entity.points[0].y,
      entity.points[0].z
    )
  )
  verts.push(
    new THREE.Vector3(
      entity.points[1].x,
      entity.points[1].y,
      entity.points[1].z
    )
  )
  verts.push(
    new THREE.Vector3(
      entity.points[2].x,
      entity.points[2].y,
      entity.points[2].z
    )
  )
  verts.push(
    new THREE.Vector3(
      entity.points[3].x,
      entity.points[3].y,
      entity.points[3].z
    )
  )

  // Calculate which direction the points are facing (clockwise or counter-clockwise)
  var vector1 = new THREE.Vector3()
  var vector2 = new THREE.Vector3()
  vector1.subVectors(verts[1], verts[0])
  vector2.subVectors(verts[2], verts[0])
  vector1.cross(vector2)

  // If z < 0 then we must draw these in reverse order
  if (vector1.z < 0) {
    geometry.faces.push(new THREE.Face3(2, 1, 0))
    geometry.faces.push(new THREE.Face3(2, 3, 0))
  } else {
    geometry.faces.push(new THREE.Face3(0, 1, 2))
    geometry.faces.push(new THREE.Face3(0, 3, 2))
  }

  material = new THREE.MeshBasicMaterial({
    color: getColor(entity, data)
  })
  return new THREE.Mesh(geometry, material)
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function drawText(entity, data, font) {
  var geometry, material, text
  if (!font)
    return console.warn(
      'Text is not supported without a Three.js font loaded with THREE.FontLoader! Load a font of your choice and pass this into the constructor. See the sample for this repository or Three.js examples at http://threejs.org/examples/?q=text#webgl_geometry_text for more details.'
    )
  geometry = new THREE.TextBufferGeometry(entity.text, {
    font: font,
    height: 0,
    size: entity.textHeight / 2 || 12
  })

  if (entity.rotation) {
    var zRotation = (entity.rotation * Math.PI) / 180
    geometry.rotateZ(zRotation)
  }

  material = new THREE.MeshBasicMaterial({
    color: getColor(entity, data)
  })

  text = new THREE.Mesh(geometry, material)
  text.position.x = entity.startPoint.x
  text.position.y = entity.startPoint.y
  text.position.z = entity.startPoint.z

  return text
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function drawPoint(entity, data) {
  var geometry, material, point
  geometry = new THREE.Geometry()
  geometry.vertices.push(
    new THREE.Vector3(entity.position.x, entity.position.y, entity.position.z)
  )
  var numPoints = 1
  var color = getColor(entity, data)
  var colors = new Float32Array(numPoints * 3)
  colors[0] = color.r
  colors[1] = color.g
  colors[2] = color.b
  geometry.colors = colors
  geometry.computeBoundingBox()
  material = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: THREE.VertexColors
  })
  point = new THREE.Points(geometry, material)

  return point
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function drawDimension(entity, data, font) {
  const block = data.blocks[entity.block]
  let lineVecs = []
  if (!block || !block.entities) return { group: null, lineVecs: lineVecs }

  const group = new THREE.Object3D()
  // if(entity.anchorPoint) {
  //     group.position.x = entity.anchorPoint.x;
  //     group.position.y = entity.anchorPoint.y;
  //     group.position.z = entity.anchorPoint.z;
  // }

  for (let i = 0; i < block.entities.length; i++) {
    const result = drawEntity(block.entities[i], data, font)
    const childEntity = result.mesh
    lineVecs = result.lineVecs

    if (childEntity) group.add(childEntity)
  }

  return { group: group, lineVecs: lineVecs }
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function drawBlock(entity, data, font) {
  const block = data.blocks[entity.name]
  const group = new THREE.Object3D()
  let lineVecs = []
  if (entity.xScale) group.scale.x = entity.xScale
  if (entity.yScale) group.scale.y = entity.yScale
  if (entity.rotation) {
    group.rotation.z = (entity.rotation * Math.PI) / 180
  }
  if (entity.position) {
    group.position.x = entity.position.x
    group.position.y = entity.position.y
    group.position.z = entity.position.z
  }
  group.position.z = 0 //FIX:zがundefinedにならないように
  if (!block.entities) return group
  for (var i = 0; i < block.entities.length; i++) {
    const result = drawEntity(block.entities[i], data, font)
    const childEntity = result.mesh
    lineVecs = result.lineVecs

    if (childEntity) group.add(childEntity)
  }
  return { group: group, lineVecs: lineVecs }
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function getColor(entity, data) {
  var color = 0x000000 //default
  if (entity.color) {
    color = entity.color
  } else if (
    data.tables &&
    data.tables.layer &&
    data.tables.layer.layers[entity.layer]
  ) {
    color = data.tables.layer.layers[entity.layer].color
  }
  if (color == null || color === 0xffffff) {
    color = 0x000000
  }
  return color
}

/**
 * createLineTypeShaders
 * @param {Object} data
 * @return data
 */
function createLineTypeShaders(data) {
  if (!data.tables || !data.tables.lineType) return

  const ltypes = data.tables.lineType.lineTypes
  for (const type in ltypes) {
    const ltype = ltypes[type]
    if (!ltype.pattern) continue

    data.tables.lineType.lineTypes[type].material = createDashedLineShader(ltype.pattern)
  }
  return data
}

/**
 * Viewer class for a dxf object.
 * @param {Object} entity
 * @param {Object} data
 */
function createDashedLineShader(pattern) {
  var i,
    dashedLineShader = {},
    totalLength = 0.0
  for (i = 0; i < pattern.length; i++) {
    totalLength += Math.abs(pattern[i])
  }
  dashedLineShader.uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib['common'],
    THREE.UniformsLib['fog'],
    {
      pattern: {
        type: 'fv1',
        value: pattern
      },
      patternLength: {
        type: 'f',
        value: totalLength
      }
    }
  ])
  dashedLineShader.vertexShader = [
    'attribute float lineDistance;',
    'varying float vLineDistance;',
    THREE.ShaderChunk['color_pars_vertex'],
    'void main() {',
    THREE.ShaderChunk['color_vertex'],
    'vLineDistance = lineDistance;',
    'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
    '}'
  ].join('\n')
  dashedLineShader.fragmentShader = [
    'uniform vec3 diffuse;',
    'uniform float opacity;',
    'uniform float pattern[' + pattern.length + '];',
    'uniform float patternLength;',
    'varying float vLineDistance;',
    THREE.ShaderChunk['color_pars_fragment'],
    THREE.ShaderChunk['fog_pars_fragment'],
    'void main() {',
    'float pos = mod(vLineDistance, patternLength);',
    'for ( int i = 0; i < ' + pattern.length + '; i++ ) {',
    'pos = pos - abs(pattern[i]);',
    'if( pos < 0.0 ) {',
    'if( pattern[i] > 0.0 ) {',
    'gl_FragColor = vec4(1.0, 0.0, 0.0, opacity );',
    'break;',
    '}',
    'discard;',
    '}',
    '}',
    THREE.ShaderChunk['color_fragment'],
    THREE.ShaderChunk['fog_fragment'],
    '}'
  ].join('\n')
  return dashedLineShader
}

/**
 * @param {Object} scene
 */
function findExtents(scene) {
  for (var child of scene.children) {
    var minX, maxX, minY, maxY
    if (child.position) {
      minX = Math.min(child.position.x, minX)
      minY = Math.min(child.position.y, minY)
      maxX = Math.max(child.position.x, maxX)
      maxY = Math.max(child.position.y, maxY)
    }
  }

  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
}


// Show/Hide helpers from https://plainjs.com/javascript/effects/hide-or-show-an-element-42/
// get the default display style of an element
function defaultDisplay(tag) {
  var iframe = document.createElement('iframe')
  iframe.setAttribute('frameborder', 0)
  iframe.setAttribute('width', 0)
  iframe.setAttribute('height', 0)
  document.documentElement.appendChild(iframe)

  var doc = (iframe.contentWindow || iframe.contentDocument).document

  // IE support
  doc.write()
  doc.close()

  var testEl = doc.createElement(tag)
  doc.documentElement.appendChild(testEl)
  var display = (window.getComputedStyle
    ? getComputedStyle(testEl, null)
    : testEl.currentStyle
  ).display
  iframe.parentNode.removeChild(iframe)
  return display
}

// actual show/hide function used by show() and hide() below
function showHide(el, show) {
  var value = el.getAttribute('data-olddisplay'),
    display = el.style.display,
    computedDisplay = (window.getComputedStyle
      ? getComputedStyle(el, null)
      : el.currentStyle
    ).display

  if (show) {
    if (!value && display === 'none') el.style.display = ''
    if (el.style.display === '' && computedDisplay === 'none')
      value = value || defaultDisplay(el.nodeName)
  } else {
    if ((display && display !== 'none') || !(computedDisplay == 'none'))
      el.setAttribute(
        'data-olddisplay',
        computedDisplay == 'none' ? display : computedDisplay
      )
  }
  if (!show || el.style.display === 'none' || el.style.display === '')
    el.style.display = show ? value || '' : 'none'
}

// helper functions
function show(el) {
  showHide(el, true)
}
function hide(el) {
  showHide(el)
}
