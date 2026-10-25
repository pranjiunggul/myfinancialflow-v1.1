import React, { useState, useEffect } from 'react';
import {
  Target,
  Plus,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Edit2,
  Trash2,
  ShieldCheck,
  Plane,
  Laptop,
  Car,
  Home,
  GraduationCap,
  Heart,
} from 'lucide-react';
import type { FinancialGoal, Account, Transaction, CurrencyCode } from '../../types';
import {
  getActiveGoals,
  deleteGoal,
  addGoalContribution,
  calculateGoalProgress,
  type GoalProgressResult,
} from '../../services/goals';
import { GoalModal } from './GoalModal';
import { formatCurrency } from '../../services/fx';

interface GoalsViewProps {
  accounts: Account[];
  transactions: Transaction[];
  baseCurrency: CurrencyCode;
}

const ICON_MAP: Record<string, any> = {
  Target,
  ShieldCheck,
  Plane,
  Laptop,
  Car,
  Home,
  GraduationCap,
  Heart,
};

export const GoalsView: React.FC<GoalsViewProps> = ({
  accounts,
  transactions,
  baseCurrency,
}) => {
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [goalToEdit, setGoalToEdit] = useState<FinancialGoal | null>(null);
  const [contributeGoalId, setContributeGoalId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');

  const loadGoals = async () => {
    const list = await getActiveGoals();
    setGoals(list);
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const handleDelete = async (goal: FinancialGoal) => {
    if (confirm(`Are you sure you want to delete goal "${goal.name}"?`)) {
      await deleteGoal(goal.id);
      loadGoals();
    }
  };

  const handleContributeSubmit = async (e: React.FormEvent, goalId: string) => {
    e.preventDefault();
    const amt = parseFloat(contributeAmount);
    if (!isNaN(amt) && amt > 0) {
      await addGoalContribution(goalId, amt);
      setContributeAmount('');
      setContributeGoalId(null);
      loadGoals();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & New Goal Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-2xl backdrop-blur-md">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Savings & Financial Goals</h1>
            <p className="text-xs text-slate-400">
              Track progress toward targets with dynamic velocity-projected completion dates
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setGoalToEdit(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl transition shadow-lg shadow-emerald-500/20 text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Goal</span>
        </button>
      </div>

      {/* Goals Grid */}
      {goals.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 flex items-center justify-center text-slate-500 mb-3">
            <Target className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-300">No goals configured yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            Create your first savings target, emergency fund, or major purchase milestone.
          </p>
          <button
            onClick={() => {
              setGoalToEdit(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition"
          >
            Create Your First Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((goal) => {
            const IconComponent = (goal.icon && ICON_MAP[goal.icon]) || Target;
            const progress: GoalProgressResult = calculateGoalProgress(
              goal,
              accounts,
              transactions,
              baseCurrency
            );

            return (
              <div
                key={goal.id}
                className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
              >
                {/* Top Row: Icon, Name & Actions */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="p-2.5 rounded-xl text-white shadow-sm"
                      style={{ backgroundColor: goal.color || '#10b981' }}
                    >
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white leading-tight">{goal.name}</h3>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-[11px] text-slate-400 capitalize">
                          {goal.trackingMode === 'linked_account' ? 'Linked Account' : 'Manual Tracking'}
                        </span>
                        {goal.targetDate && (
                          <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                            <span>•</span>
                            <Calendar className="w-3 h-3 inline mr-0.5" />
                            <span>Target: {goal.targetDate}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        setGoalToEdit(goal);
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      title="Edit Goal"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(goal)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Delete Goal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar & Numbers */}
                <div>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-sm font-semibold text-white">
                      {formatCurrency(progress.currentAmount, baseCurrency)}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      of {formatCurrency(progress.targetAmount, baseCurrency)} ({progress.percentage}%)
                    </span>
                  </div>

                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progress.percentage}%`,
                        backgroundColor: goal.color || '#10b981',
                      }}
                    />
                  </div>
                </div>

                {/* Velocity & Projection Callout */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center space-x-1">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Saving Velocity:</span>
                    </span>
                    <span className="font-semibold text-slate-200">
                      ~{formatCurrency(progress.monthlyVelocity, baseCurrency)} / month
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 pt-0.5">
                    {progress.isCompleted ? (
                      <span className="text-emerald-400 font-medium flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                        Target Achieved!
                      </span>
                    ) : progress.projectedCompletionDate ? (
                      <span>
                        Projected completion:{' '}
                        <strong className="text-emerald-300 font-semibold">
                          {progress.projectedCompletionDate}
                        </strong>{' '}
                        (~{progress.monthsRemaining} months left)
                      </span>
                    ) : (
                      <span className="text-amber-400/90 flex items-center space-x-1">
                        <AlertCircle className="w-3 h-3 inline mr-1" />
                        Pace is stagnant (no recent savings detected)
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Add Contribution (Manual mode) */}
                {goal.trackingMode === 'manual' && !progress.isCompleted && (
                  <div>
                    {contributeGoalId === goal.id ? (
                      <form
                        onSubmit={(e) => handleContributeSubmit(e, goal.id)}
                        className="flex items-center space-x-2 pt-1"
                      >
                        <input
                          type="number"
                          placeholder="Amount to add"
                          value={contributeAmount}
                          onChange={(e) => setContributeAmount(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          autoFocus
                          required
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg transition"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setContributeGoalId(null)}
                          className="px-2.5 py-1.5 text-slate-400 hover:text-white text-xs"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => {
                          setContributeGoalId(goal.id);
                          setContributeAmount('');
                        }}
                        className="w-full py-2 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium rounded-xl border border-slate-700/60 transition flex items-center justify-center space-x-1.5"
                      >
                        <Plus className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Add Savings Contribution</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Goal Modal */}
      <GoalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGoalSaved={loadGoals}
        accounts={accounts}
        baseCurrency={baseCurrency}
        goalToEdit={goalToEdit}
      />
    </div>
  );
};
