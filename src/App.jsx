import * as THREE from 'three';
import { useEffect, useRef, useState } from 'react';
import { Canvas, extend, useThree, useFrame } from '@react-three/fiber';
import {
  useGLTF,
  useTexture,
  Environment,
  Lightformer,
} from '@react-three/drei';
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useRopeJoint,
  useSphericalJoint,
} from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import { useControls } from 'leva';

extend({ MeshLineGeometry, MeshLineMaterial });
useGLTF.preload(
  'https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/5huRVDzcoDwnbgrKUo1Lzs/53b6dd7d6b4ffcdbd338fa60265949e1/tag.glb'
);
useTexture.preload(
  'https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/SOT1hmCesOHxEYxL7vkoZ/c57b29c85912047c414311723320c16b/band.jpg'
);

// Define WaterParticle component
const WaterParticle = ({ position, radius }) => {
  return (
    <RigidBody
      position={position} // Initial world position
      linearDamping={0.7} // Water-like damping
      angularDamping={0.7}
      restitution={0.1} // Less bouncy
      friction={0.3}
      canSleep={true}
    >
      <BallCollider args={[radius]} />
      <mesh castShadow>
        <sphereGeometry args={[radius, 8, 8]} />{' '}
        {/* Lower poly for particles */}
        <meshStandardMaterial
          color="skyblue"
          transparent
          opacity={0.65}
          roughness={0.1}
          metalness={0.0}
        />
      </mesh>
    </RigidBody>
  );
};

export default function App() {
  const { debug } = useControls({ debug: false });
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <Canvas camera={{ position: [0, 0, 13], fov: 25 }}>
        <ambientLight intensity={Math.PI} />
        <Physics
          debug={debug}
          interpolate
          gravity={[0, -40, 0]} // Existing gravity
          timeStep={1 / 60}
        >
          <Band />
          {/* Water particles will be rendered by the Band component */}
        </Physics>
        <Environment background blur={0.75}>
          <color attach="background" args={['black']} />
          <Lightformer
            intensity={2}
            color="white"
            position={[0, -1, 5]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[-1, -1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[1, 1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={10}
            color="white"
            position={[-10, 0, 14]}
            rotation={[0, Math.PI / 2, Math.PI / 3]}
            scale={[100, 10, 1]}
          />
        </Environment>
      </Canvas>
    </div>
  );
}

function Band({ maxSpeed = 50, minSpeed = 10 }) {
  const band = useRef(), fixed = useRef(), j1 = useRef(), j2 = useRef(), j3 = useRef(), card = useRef() // prettier-ignore
  const vec = new THREE.Vector3(), ang = new THREE.Vector3(), rot = new THREE.Vector3(), dir = new THREE.Vector3() // prettier-ignore
  const segmentProps = {
    type: 'dynamic',
    canSleep: true,
    colliders: false,
    angularDamping: 2,
    linearDamping: 2,
  };
  const { nodes, materials } = useGLTF(
    'https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/5huRVDzcoDwnbgrKUo1Lzs/53b6dd7d6b4ffcdbd338fa60265949e1/tag.glb'
  );
  const texture = useTexture(
    'https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/SOT1hmCesOHxEYxL7vkoZ/c57b29c85912047c414311723320c16b/band.jpg'
  );
  const { width, height } = useThree((state) => state.size);
  const [curve] = useState(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ])
  );
  const [dragged, drag] = useState(false);
  const [hovered, hover] = useState(false);

  // Water particle properties
  const numParticles = 80;
  const particleRadius = 0.035;
  const waterLayerDepth = 0.1; // Total depth of the water layer volume

  // Card dimensions (half-extents for its main collider)
  const cardHx = 0.8;
  const cardHy = 1.125;
  const cardHzMain = 0.01; // Half-thickness of the main card body

  // Container wall properties (half-thickness for the collider shapes)
  const wallHalfThickness = 0.005;

  // Calculate Z center and half-depth for the water container volume
  // Water container is positioned in front of the card's main body
  const waterContainerLocalZCenter = cardHzMain + waterLayerDepth / 2;
  const waterContainerLocalHalfDepth = waterLayerDepth / 2;

  const [initialParticlePositions, setInitialParticlePositions] = useState([]);

  useEffect(() => {
    const particles = [];
    // Card RigidBody is at [2,0,0] relative to its parent group at [0,4,0]
    const cardInitialWorldPos = new THREE.Vector3(2, 4, 0);

    // Define spawn boundaries in card's local space
    const spawnLocalXMin = -cardHx + 2 * wallHalfThickness + particleRadius;
    const spawnLocalXMax = cardHx - 2 * wallHalfThickness - particleRadius;

    const spawnLocalYMin = -cardHy + 2 * wallHalfThickness + particleRadius;
    // Spawn particles in a shallow layer at the bottom of the container
    const spawnLayerHeight = Math.min(waterLayerDepth * 0.6, cardHy * 0.4);
    const spawnLocalYMax = spawnLocalYMin + spawnLayerHeight;

    const spawnLocalZMin = cardHzMain + 2 * wallHalfThickness + particleRadius;
    const spawnLocalZMax =
      cardHzMain + waterLayerDepth - 2 * wallHalfThickness - particleRadius;

    if (
      spawnLocalXMin < spawnLocalXMax &&
      spawnLocalYMin < spawnLocalYMax &&
      spawnLocalZMin < spawnLocalZMax
    ) {
      for (let i = 0; i < numParticles; i++) {
        const localX =
          spawnLocalXMin + Math.random() * (spawnLocalXMax - spawnLocalXMin);
        const localY =
          spawnLocalYMin + Math.random() * (spawnLocalYMax - spawnLocalYMin);
        const localZ =
          spawnLocalZMin + Math.random() * (spawnLocalZMax - spawnLocalZMin);

        particles.push({
          id: `particle-${i}`,
          position: [
            cardInitialWorldPos.x + localX,
            cardInitialWorldPos.y + localY,
            cardInitialWorldPos.z + localZ,
          ],
        });
      }
    } else {
      console.warn(
        'Water particle container dimensions are too small for the given particle radius and wall thickness. No particles spawned.'
      );
    }
    setInitialParticlePositions(particles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]) // prettier-ignore
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]) // prettier-ignore
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]) // prettier-ignore
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.45, 0]]) // prettier-ignore

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab';
      return () => void (document.body.style.cursor = 'auto');
    }
  }, [hovered, dragged]);

  useFrame((state, delta) => {
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp());
      card.current?.setNextKinematicTranslation({
        x: vec.x - dragged.x,
        y: vec.y - dragged.y,
        z: vec.z - dragged.z,
      });
    }
    if (fixed.current) {
      // Fix most of the jitter when over pulling the card
      [j1, j2].forEach((ref) => {
        if (!ref.current.lerped)
          ref.current.lerped = new THREE.Vector3().copy(
            ref.current.translation()
          );
        const clampedDistance = Math.max(
          0.1,
          Math.min(1, ref.current.lerped.distanceTo(ref.current.translation()))
        );
        ref.current.lerped.lerp(
          ref.current.translation(),
          delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed))
        );
      });
      // Calculate catmul curve
      curve.points[0].copy(j3.current.translation());
      curve.points[1].copy(j2.current.lerped);
      curve.points[2].copy(j1.current.lerped);
      curve.points[3].copy(fixed.current.translation());
      band.current.geometry.setPoints(curve.getPoints(32));
      // Tilt it back towards the screen
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
    }
  });

  curve.curveType = 'chordal';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          position={[2, 0, 0]}
          ref={card}
          {...segmentProps}
          type={dragged ? 'kinematicPosition' : 'dynamic'}
        >
          {/* Main card collider (thin back plate) */}
          <CuboidCollider args={[cardHx, cardHy, cardHzMain]} />

          {/* Invisible walls for water container. Positions are local to the card RigidBody. */}
          {/* Args for CuboidCollider are half-extents. */}

          {/* Floor */}
          <CuboidCollider
            args={[cardHx, wallHalfThickness, waterContainerLocalHalfDepth]}
            position={[
              0,
              -cardHy + wallHalfThickness,
              waterContainerLocalZCenter,
            ]}
          />
          {/* Left Wall */}
          <CuboidCollider
            args={[wallHalfThickness, cardHy, waterContainerLocalHalfDepth]}
            position={[
              -cardHx + wallHalfThickness,
              0,
              waterContainerLocalZCenter,
            ]}
          />
          {/* Right Wall */}
          <CuboidCollider
            args={[wallHalfThickness, cardHy, waterContainerLocalHalfDepth]}
            position={[
              cardHx - wallHalfThickness,
              0,
              waterContainerLocalZCenter,
            ]}
          />
          {/* Back Wall of water container (sits at the front face of the main card body) */}
          <CuboidCollider
            args={[cardHx, cardHy, wallHalfThickness]}
            position={[
              0,
              0,
              waterContainerLocalZCenter -
                waterContainerLocalHalfDepth +
                wallHalfThickness,
            ]}
          />
          {/* Front Wall of water container (to keep particles from spilling out the front) */}
          <CuboidCollider
            args={[cardHx, cardHy, wallHalfThickness]}
            position={[
              0,
              0,
              waterContainerLocalZCenter +
                waterContainerLocalHalfDepth -
                wallHalfThickness,
            ]}
          />

          <group
            scale={2.25}
            position={[0, -1.2, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={(e) => (
              e.target.releasePointerCapture(e.pointerId), drag(false)
            )}
            onPointerDown={(e) => (
              e.target.setPointerCapture(e.pointerId),
              drag(
                new THREE.Vector3()
                  .copy(e.point)
                  .sub(vec.copy(card.current.translation()))
              )
            )}
          >
            <mesh geometry={nodes.card.geometry}>
              <meshPhysicalMaterial
                map={materials.base.map}
                map-anisotropy={16}
                clearcoat={1}
                clearcoatRoughness={0.15}
                roughness={0.3}
                metalness={0.5}
              />
            </mesh>
            <mesh
              geometry={nodes.clip.geometry}
              material={materials.metal}
              material-roughness={0.3}
            />
            <mesh geometry={nodes.clamp.geometry} material={materials.metal} />
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={[width, height]}
          useMap
          map={texture}
          repeat={[-3, 1]}
          lineWidth={1}
        />
      </mesh>
      {/* Render water particles */}
      {initialParticlePositions.map((p) => (
        <WaterParticle
          key={p.id}
          position={p.position}
          radius={particleRadius}
        />
      ))}
    </>
  );
}
