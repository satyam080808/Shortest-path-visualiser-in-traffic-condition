import React from "react";

// Card wrapper component
export const Card = ({ className, children, ...props }) => {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white shadow-sm ${
        className || ""
      }`}
      {...props}
    >
      {children}
    </div>
  );
};

// Card header component
export const CardHeader = ({ className, children, ...props }) => {
  return (
    <div
      className={`px-6 py-4 border-b border-gray-200 ${className || ""}`}
      {...props}
    >
      {children}
    </div>
  );
};

// Card title component
export const CardTitle = ({ className, children, ...props }) => {
  return (
    <h3
      className={`text-xl font-semibold tracking-tight text-gray-900 ${
        className || ""
      }`}
      {...props}
    >
      {children}
    </h3>
  );
};

// Card content component
export const CardContent = ({ className, children, ...props }) => {
  return (
    <div className={`px-6 py-4 ${className || ""}`} {...props}>
      {children}
    </div>
  );
};

// Card footer component (additional component you might need)
export const CardFooter = ({ className, children, ...props }) => {
  return (
    <div
      className={`px-6 py-4 border-t border-gray-200 ${className || ""}`}
      {...props}
    >
      {children}
    </div>
  );
};
