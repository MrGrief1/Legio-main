
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 rounded-[32px] p-6 transition-colors duration-200 ${className}`}>
    {children}
  </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  fullWidth = false,
  className = '',
  icon,
  ...props
}) => {
  const baseStyles = "flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium transition-all duration-200 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black";

  const variants = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 border border-transparent",
    secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white border border-zinc-200 dark:border-zinc-800",
    outline: "bg-transparent border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-500",
    ghost: "bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {icon && <span className="w-4 h-4">{icon}</span>}
      {children}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ icon, className = '', ...props }) => (
  <div className="relative group w-full">
    {icon && (
      <div className="absolute left-4 top-0 bottom-0 flex items-center justify-center text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors pointer-events-none">
        {icon}
      </div>
    )}
    <input
      className={`w-full bg-zinc-100 dark:bg-zinc-900 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-600 focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 rounded-full py-3 ${icon ? 'pl-11' : 'pl-5'} pr-5 text-sm text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-600 focus:outline-none transition-all duration-200 ${className}`}
      {...props}
    />
  </div>
);
