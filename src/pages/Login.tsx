import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Phone, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/use-toast'

const Login = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user, loading: authLoading, signUp, signIn } = useAuth()
  const [step, setStep] = useState<'login' | 'register' | 'otp'>('login')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: ''
  })
  const [otp, setOtp] = useState(['', '', '', '', '', ''])

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleOtpChange = (index: number, value: string) => {
    if (value.length <= 1) {
      const newOtp = [...otp]
      newOtp[index] = value
      setOtp(newOtp)
      
      // Auto-focus next input
      if (value && index < 5) {
        const nextInput = document.getElementById(`otp-${index + 1}`)
        nextInput?.focus()
      }
    }
  }

  const handleLogin = async () => {
    if (!formData.email || !formData.password) {
      toast({
        title: "Missing Information",
        description: "Please fill in email and password",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      await signIn(formData.email, formData.password)
      
      toast({
        title: "Welcome back!",
        description: "You have been logged in successfully"
      })
      
      navigate('/')
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials. Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!formData.fullName || !formData.email || !formData.phone || !formData.password) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      await signUp(formData.email, formData.password, {
        fullName: formData.fullName,
        phone: formData.phone
      })
      
      toast({
        title: "Registration Successful!",
        description: "Please check your email to verify your account"
      })
      
      navigate('/')
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message || "Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-lilac flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">
            CampusLink VIT
          </CardTitle>
          <CardDescription>
            {step === 'login'
              ? 'Sign in with your credentials'
              : 'Register with your VIT student details'
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {step === 'login' ? (
            <>
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@vitstudent.ac.in"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                />
              </div>

              <Button 
                onClick={handleLogin}
                disabled={loading || authLoading}
                className="w-full btn-campus-primary"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </Button>

              <Button 
                variant="ghost"
                onClick={() => setStep('register')}
                className="w-full"
              >
                Don't have an account? Register
              </Button>
            </>
          ) : (
            <>
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* VIT Email */}
              <div className="space-y-2">
                <Label htmlFor="email">VIT Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="yourname@vitstudent.ac.in"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Use your official VIT student email
                </p>
              </div>

              {/* Phone Number */}
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="flex">
                  <div className="flex items-center px-3 bg-muted border border-r-0 rounded-l-md">
                    <Phone className="h-4 w-4 text-muted-foreground mr-2" />
                    <span className="text-sm">+91</span>
                  </div>
                  <Input
                    id="phone"
                    placeholder="Enter 10-digit number"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="rounded-l-none"
                    maxLength={10}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                />
              </div>

              <Button 
                onClick={handleRegister}
                disabled={loading || authLoading}
                className="w-full btn-campus-primary"
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>

              <Button 
                variant="ghost"
                onClick={() => setStep('login')}
                className="w-full"
              >
                Already have an account? Sign In
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Login