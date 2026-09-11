import { Problem } from '../domain/models.js';

export const ALL_SKILL_IDS = [
  'requirement_understanding',
  'responsibility_design',
  'coupling_cohesion',
  'abstraction_encapsulation',
  'extensibility',
  'scalability',
  'failure_handling',
  'edge_cases_testability',
];

export const PROBLEMS: Problem[] = [
  {
    id: 'parking-lot',
    title: 'Design a Parking Lot',
    description:
      'Design a multi-floor parking lot that supports multiple vehicle types, real-time availability, and parking fee calculation.',
    requirements: [
      'Support multiple floors with multiple spot sizes (small, medium, large)',
      'Support different vehicle types (sedan, SUV, truck, motorcycle)',
      'Assign vehicles to appropriate spots based on size',
      'Track entry and exit times',
      'Calculate parking fees based on duration and vehicle type',
      'Report real-time availability across the lot',
    ],
    constraints: [
      'Concurrent access: many vehicles entering and leaving simultaneously',
      'No over-assignment: two vehicles must never get the same spot',
      'Fees must be queryable after exit',
    ],
    assumptions: [
      'One entry and one exit lane at ground level',
      'Each floor has a fixed layout with known spot count and sizes',
      'Spot sizes are fixed and cannot be reassigned between floors',
    ],
    evaluationProfile: { skillIds: ALL_SKILL_IDS },
  },
  {
    id: 'elevator',
    title: 'Design an Elevator Control System',
    description:
      'Design an elevator control system for a multi-story building with multiple elevators.',
    requirements: [
      'Manage multiple elevators in a single building',
      'Handle floor requests from inside and outside elevators',
      'Respect capacity limits (weight and passenger count)',
      'Handle direction-based requests (up/down) efficiently',
      'Support emergency stop and maintenance modes',
    ],
    constraints: [
      'N stories, M elevators, where N and M are configurable',
      'Elevators cannot pass each other in a single shaft',
      'Requests must be served with reasonable latency',
    ],
    assumptions: [
      'Building has a fixed number of floors',
      'Elevators operate in separate shafts (no shared shaft)',
      'A dispatcher coordinates which elevator serves which request',
    ],
    evaluationProfile: { skillIds: ALL_SKILL_IDS },
  },
  {
    id: 'vending-machine',
    title: 'Design a Vending Machine',
    description:
      'Design a vending machine that sells products, manages inventory, and accepts multiple payment methods.',
    requirements: [
      'Maintain a product catalog with pricing',
      'Manage inventory (stock levels, sold-out detection)',
      'Accept cash and card payments',
      'Dispense product and calculate change',
      'Handle a transaction from product selection to dispense',
    ],
    constraints: [
      'Finite inventory that must never go negative',
      'Cash payments may require exact change or dispensing change',
      'One transaction at a time (single user); concurrent interaction must be serialized',
    ],
    assumptions: [
      'Products occupy fixed slot positions',
      'Payment authorization is async (card) and can fail',
      'Change denominations are limited',
    ],
    evaluationProfile: { skillIds: ALL_SKILL_IDS },
  },
];