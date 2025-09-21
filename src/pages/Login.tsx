import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Phone, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'

const Login = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [step, setStep] = useState<'register' | 'otp'>('register')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: ''
  })
  const [otp, setOtp] = useState(['', '', '', '', '', ''])

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

  const handleSendOtp = async () => {
    if (!formData.fullName || !formData.email || !formData.phone) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      // TODO: Implement OTP sending with Supabase
      // For now, simulate OTP sending
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      toast({
        title: "OTP Sent",
        description: "Please check your phone for the verification code"
      })
      
      setStep('otp')
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send OTP. Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    const otpCode = otp.join('')
    if (otpCode.length !== 6) {
      toast({
        title: "Invalid OTP",
        description: "Please enter all 6 digits",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      // TODO: Implement OTP verification with Supabase
      // For now, simulate successful verification
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      toast({
        title: "Welcome to CampusLink!",
        description: "Your account has been verified successfully"
      })
      
      navigate('/')
    } catch (error) {
      toast({
        title: "Verification Failed",
        description: "Invalid OTP. Please try again.",
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
            {step === 'register' 
              ? 'Register with your VIT student details'
              : 'Enter the OTP sent to your phone'
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {step === 'register' ? (
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

              <Button 
                onClick={handleSendOtp}
                disabled={loading}
                className="w-full btn-campus-primary"
              >
                {loading ? 'Sending...' : 'Send OTP →'}
              </Button>
            </>
          ) : (
            <>
              {/* OTP Input */}
              <div className="space-y-2">
                <Label>Enter OTP</Label>
                <div className="flex justify-center space-x-2">
                  {otp.map((digit, index) => (
                    <Input
                      key={index}
                      id={`otp-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      className="w-12 h-12 text-center text-lg font-semibold"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Button 
                  onClick={handleVerifyOtp}
                  disabled={loading}
                  className="w-full btn-campus-primary"
                >
                  {loading ? 'Verifying...' : 'Verify & Continue'}
                </Button>

                <Button 
                  variant="ghost"
                  onClick={() => setStep('register')}
                  className="w-full"
                >
                  ← Back to Registration
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Login