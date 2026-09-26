/**
 * Printer card plate swap (#1306).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { render } from '../utils';
import { server } from '../mocks/server';
import { InstalledPlateSelector } from '../../components/InstalledPlateSelector';
import type { Printer } from '../../api/client';

const printer = { id: 4, name: 'P1S-1', installed_plate_id: null } as unknown as Printer;

const plates = [
  {
    id: 1, builtin_key: 'textured_pei', is_builtin: true, name: 'Textured PEI Plate', base_type: 'textured_pei',
    base_type_label: 'Textured PEI Plate', pattern: null, image: null, notes: null, enabled: true, sort_order: 60,
    installed_on: [],
  },
  {
    id: 2, builtin_key: '3d_effect_starry', is_builtin: true, name: '3D Effect – Starry', base_type: 'smooth_pei',
    base_type_label: 'Smooth PEI / High Temp Plate', pattern: 'Starry', image: null, notes: null, enabled: false,
    sort_order: 110, installed_on: [],
  },
];

function mockSettings(tracking: boolean) {
  server.use(
    http.get('/api/v1/settings/', () => HttpResponse.json({ build_plate_tracking_enabled: tracking })),
    http.get('/api/v1/build-plates', () => HttpResponse.json(plates)),
  );
}

describe('InstalledPlateSelector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing while tracking is off', async () => {
    mockSettings(false);
    const { container } = render(<InstalledPlateSelector printer={printer} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('select')).toBeNull();
  });

  it('offers only ticked plates and swaps on change', async () => {
    mockSettings(true);
    const swapped = vi.fn();
    server.use(
      http.put('/api/v1/printers/4/installed-plate', async ({ request }) => {
        swapped(await request.json());
        return HttpResponse.json({ ...printer, installed_plate_id: 1 });
      }),
    );
    render(<InstalledPlateSelector printer={printer} />);
    const select = await screen.findByRole('combobox', { name: 'Installed build plate' });
    await screen.findByRole('option', { name: 'Textured PEI Plate' });
    expect(screen.queryByRole('option', { name: '3D Effect – Starry' })).toBeNull();

    await userEvent.selectOptions(select, '1');
    await waitFor(() => expect(swapped).toHaveBeenCalledWith({ plate_id: 1 }));
  });

  it('falls back to the base type icon when a plate photo is missing', async () => {
    server.use(
      http.get('/api/v1/settings/', () => HttpResponse.json({ build_plate_tracking_enabled: true })),
      http.get('/api/v1/build-plates', () =>
        HttpResponse.json([{ ...plates[1], enabled: true, image: '/img/plates/3d_effect_starry.jpg' }]),
      ),
    );
    const { container } = render(<InstalledPlateSelector printer={{ ...printer, installed_plate_id: 2 }} />);
    await screen.findByRole('option', { name: '3D Effect – Starry' });
    const img = await waitFor(() => {
      const el = container.querySelector('img');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(img).toHaveAttribute('src', '/img/plates/3d_effect_starry.jpg');
    fireEvent.error(img);
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', '/img/bed/bed_pei_cool.png'));
  });
});
