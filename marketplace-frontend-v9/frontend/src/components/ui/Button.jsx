import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, block = false, iconOnly = false, className = '', children, to, href, disabled, type = 'button', ...rest }, ref,
) {
  const cls = ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', iconOnly && 'btn-icon', className].filter(Boolean).join(' ');
  const content = (
    <>
      {loading ? <span className="spinner" aria-hidden="true" /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" /> : null}
      {!(iconOnly && loading) && children}
    </>
  );
  if (to) return <Link ref={ref} to={to} className={cls} aria-disabled={disabled || undefined} {...rest}>{content}</Link>;
  if (href) return <a ref={ref} href={href} className={cls} {...rest}>{content}</a>;
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>{content}</button>
  );
});
