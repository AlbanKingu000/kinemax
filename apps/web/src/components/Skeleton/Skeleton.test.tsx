import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MovieCardSkeleton, Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('is hidden from assistive technology and takes a size', () => {
    const { container } = render(<Skeleton shape="circle" width="3rem" height="3rem" />);
    const element = container.firstElementChild as HTMLElement;
    expect(element).toHaveAttribute('aria-hidden', 'true');
    expect(element.style.width).toBe('3rem');
  });

  it('renders several text lines with a shorter last line', () => {
    const { container } = render(<Skeleton lines={3} width="20rem" />);
    const lines = container.firstElementChild?.children;
    expect(lines).toHaveLength(3);
    expect((lines?.[2] as HTMLElement).style.width).toBe('60%');
  });

  it('has a movie card shape', () => {
    const { container } = render(<MovieCardSkeleton />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('span').length).toBeGreaterThan(4);
  });
});
