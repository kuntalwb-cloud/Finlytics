import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ArrowRight, Activity, ShieldCheck, BarChart3, Sparkles } from 'lucide-react';

interface WelcomeScreenProps {
  onEnter: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onEnter }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between p-6 sm:p-12 relative overflow-hidden select-none">
      {/* Animated Subtle Ambient Gradient Orbs */}
      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.5, 0.75, 0.5],
        }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-blue-200/50 rounded-full blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
        className="absolute -bottom-24 right-1/4 w-[500px] h-[300px] bg-indigo-100/50 rounded-full blur-3xl pointer-events-none"
      />

      {/* Top Header - Animated Brand Mark */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex items-center justify-between max-w-6xl w-full mx-auto"
      >
        <div className="flex items-center gap-2.5">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 2 }}
            className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center text-white shadow-sm shadow-blue-700/20"
          >
            <TrendingUp className="w-5 h-5" />
          </motion.div>
          <span className="font-display text-xl font-bold tracking-tight text-slate-900">Finlytics</span>
        </div>
      </motion.div>

      {/* Center Welcome Hero with Staggered Entrance Animations */}
      <div className="relative z-10 max-w-3xl mx-auto text-center space-y-6 my-auto py-12">
        {/* Animated Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-semibold rounded-full shadow-xs">
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-blue-600" />
            Financial Time-Series Econometrics &amp; Machine Learning
          </span>
        </motion.div>

        {/* Animated Title */}
        <motion.h1
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight"
        >
          Welcome to <span className="text-blue-700 inline-block">Finlytics</span>
        </motion.h1>

        {/* Animated Paragraph */}
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed"
        >
          High-precision econometric forecasting and machine learning suite for financial time-series. Upload your Excel or CSV file to run ARIMA, SVR, GA-RNN, 3-State HMM, Kalman Filter, and AR(2)-GARCH/EGARCH volatility models.
        </motion.p>

        {/* Animated Feature Highlight Chips */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="pt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-700"
        >
          <motion.div
            whileHover={{ y: -2 }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-lg shadow-xs font-medium transition-shadow hover:shadow-sm"
          >
            <BarChart3 className="w-3.5 h-3.5 text-blue-700" />
            10-Day Daily / 3-Month Macro Forecasts
          </motion.div>
          <motion.div
            whileHover={{ y: -2 }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-lg shadow-xs font-medium transition-shadow hover:shadow-sm"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            AR(2)-GARCH &amp; EGARCH Volatility
          </motion.div>
          <motion.div
            whileHover={{ y: -2 }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-lg shadow-xs font-medium transition-shadow hover:shadow-sm"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            Holdout Validation &amp; Excel Export
          </motion.div>
        </motion.div>

        {/* Animated Enter Workspace Primary Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="pt-6"
        >
          <motion.button
            type="button"
            onClick={onEnter}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="relative group inline-flex items-center gap-3 px-8 py-3.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-all shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer overflow-hidden"
          >
            {/* Subtle Shimmer highlight animation on button */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '200%' }}
              transition={{
                repeat: Infinity,
                duration: 2.8,
                ease: 'easeInOut',
                repeatDelay: 1.5,
              }}
              className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 pointer-events-none"
            />
            <span>Enter Workspace</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </motion.button>
        </motion.div>
      </div>

      {/* Bottom Footer Note with Fade-in */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.7 }}
        className="relative z-10 text-center text-xs text-slate-500"
      >
        Click <strong className="font-semibold text-slate-700">Enter Workspace</strong> to access the financial modeling workbench
      </motion.div>
    </div>
  );
};
